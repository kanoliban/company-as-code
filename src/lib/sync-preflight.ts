import type { AgentContract } from "../compiler/agent";

export interface GatewayRequestClient {
  request: <T>(method: string, params?: unknown) => Promise<T>;
}

export interface PreflightLogger {
  error: (line: string) => void;
}

const DEFAULT_LOGGER: PreflightLogger = {
  error: (line) => console.error(line),
};

export async function preflightAgents(
  client: GatewayRequestClient,
  contracts: AgentContract[],
  logger: PreflightLogger = DEFAULT_LOGGER,
): Promise<boolean> {
  let response: unknown;
  try {
    response = await client.request<unknown>("agents.list", {});
  } catch (err) {
    logger.error("Failed to fetch agents list from gateway.");
    if (err instanceof Error && err.message) {
      logger.error(err.message);
    }
    return false;
  }

  const existingIds = extractAgentIds(response);
  const missing = contracts.map((c) => c.id).filter((id) => !existingIds.has(id));
  if (missing.length === 0) return true;

  logger.error("Missing agent IDs in OpenClaw config:");
  for (const id of missing) {
    logger.error(`  - ${id}`);
  }
  logger.error("Add the following entries to ~/.openclaw/openclaw.json under agents.list:");
  logger.error(formatAgentsListSnippet(missing));
  return false;
}

export function extractAgentIds(result: unknown): Set<string> {
  const ids = new Set<string>();

  const addId = (value: unknown): void => {
    if (typeof value === "string" && value.trim()) ids.add(value.trim());
  };

  if (Array.isArray(result)) {
    for (const item of result) {
      if (typeof item === "string") {
        addId(item);
        continue;
      }
      if (typeof item === "object" && item !== null) {
        const record = item as Record<string, unknown>;
        addId(record.id);
      }
    }
    return ids;
  }

  if (typeof result === "object" && result !== null) {
    const record = result as Record<string, unknown>;
    const agents = record.agents ?? record.items ?? record.list;
    if (Array.isArray(agents)) {
      for (const item of agents) {
        if (typeof item === "string") {
          addId(item);
          continue;
        }
        if (typeof item === "object" && item !== null) {
          const entry = item as Record<string, unknown>;
          addId(entry.id);
        }
      }
    }
  }

  return ids;
}

export function formatAgentsListSnippet(missingIds: string[]): string {
  const snippet = {
    agents: {
      list: missingIds.map((id) => ({ id })),
    },
  };
  return JSON.stringify(snippet, null, 2);
}
