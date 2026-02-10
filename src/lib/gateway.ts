import { randomUUID } from "node:crypto";

import WebSocket from "ws";

interface GatewayResponse {
  type?: "res" | "event";
  id?: string;
  ok?: boolean;
  payload?: unknown;
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
  clientId?: "cli" | "test" | "webchat-ui" | "openclaw-control-ui" | "webchat" | "gateway-client" | "openclaw-macos" | "openclaw-ios" | "openclaw-android" | "node-host" | "fingerprint" | "openclaw-probe";
  clientVersion?: string;
  clientMode?: "cli" | "node" | "test" | "webchat" | "ui" | "backend" | "probe";
  role?: string;
  scopes?: string[];
  userAgent?: string;
}

const DEFAULT_SCOPES = ["operator.admin", "operator.approvals", "operator.pairing"];

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

    if (!parsed || !parsed.id || parsed.type !== "res") return;
    const item = pending.get(parsed.id);
    if (!item) return;
    pending.delete(parsed.id);
    clearTimeout(item.timeout);

    if (parsed.ok === false) {
      item.reject(new Error(parsed.error?.message ?? "Gateway request failed"));
      return;
    }

    item.resolve(parsed.payload);
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
      id: options?.clientId ?? "cli",
      version: options?.clientVersion ?? "0.1.0",
      platform: process.platform,
      mode: options?.clientMode ?? "cli",
    },
    role: options?.role ?? "operator",
    scopes: options?.scopes ?? DEFAULT_SCOPES,
    auth: options?.token ? { token: options.token } : undefined,
    userAgent: options?.userAgent ?? `company-as-code/${options?.clientVersion ?? "0.1.0"}`,
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
