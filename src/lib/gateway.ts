import { randomUUID } from "node:crypto";

import WebSocket from "ws";

interface GatewayResponse {
  type?: string;
  id?: string;
  result?: unknown;
  error?: { message?: string; code?: string };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface GatewayClient {
  request: <T>(method: string, params?: unknown) => Promise<T>;
  close: () => Promise<void>;
}

export interface GatewayConnectOptions {
  token?: string;
  clientId?: string;
  clientVersion?: string;
  role?: string;
  scopes?: string[];
}

const DEFAULT_SCOPES = ["operator.read", "operator.write"];

export const createGatewayClient = async (url: string, options?: GatewayConnectOptions): Promise<GatewayClient> => {
  const ws = new WebSocket(url);
  const pending = new Map<string, PendingRequest>();

  const openPromise = new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (err) => reject(err));
  });

  ws.on("message", (data) => {
    let parsed: GatewayResponse | null = null;
    try {
      parsed = JSON.parse(data.toString()) as GatewayResponse;
    } catch {
      return;
    }

    if (!parsed || !parsed.id) return;
    const item = pending.get(parsed.id);
    if (!item) return;
    pending.delete(parsed.id);
    clearTimeout(item.timeout);

    if (parsed.error) {
      item.reject(new Error(parsed.error.message ?? "Gateway request failed"));
      return;
    }

    item.resolve(parsed.result);
  });

  ws.on("close", () => {
    for (const [id, item] of pending) {
      clearTimeout(item.timeout);
      item.reject(new Error(`Gateway connection closed (pending request ${id})`));
    }
    pending.clear();
  });

  await openPromise;

  const request = async <T>(method: string, params?: unknown): Promise<T> => {
    const id = randomUUID();
    const payload = { type: "req", id, method, params: params ?? {} };

    const result = new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Gateway request timed out: ${method}`));
      }, 30_000);

      pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
    });

    ws.send(JSON.stringify(payload));
    return result;
  };

  const connectParams = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: options?.clientId ?? "company-as-code",
      version: options?.clientVersion ?? "0.1.0",
      platform: process.platform,
      mode: "operator",
    },
    role: options?.role ?? "operator",
    scopes: options?.scopes ?? DEFAULT_SCOPES,
    auth: options?.token ? { token: options.token } : undefined,
  };

  await request("connect", connectParams);

  return {
    request,
    close: async () => {
      if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) return;
      await new Promise<void>((resolve) => {
        ws.once("close", () => resolve());
        ws.close();
      });
    },
  };
};
