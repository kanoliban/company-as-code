import * as fs from "node:fs/promises";
import path from "node:path";

import type { Command } from "commander";

import agentSchema from "../schemas/agent.schema.json";
import type { AgentBundle, AgentContract } from "../compiler/agent";
import { compileAgent } from "../compiler/agent";
import { createGatewayClient } from "../lib/gateway";
import { FileSystemRepo, findRepoRoot } from "../lib/repo";
import { createSchemaValidator } from "../lib/schema";
import { preflightAgents } from "../lib/sync-preflight";

interface CompanyConfig {
  defaults?: { gateway_ws?: string };
  gateway_ws?: string;
}

interface SyncOptions {
  gateway?: string;
  agent?: string;
  dryRun?: boolean;
  compileOnly?: boolean;
  outDir?: string;
  prune?: boolean;
  yes?: boolean;
  force?: boolean;
}

export const registerSyncCommand = (program: Command): void => {
  program
    .command("sync")
    .description("Sync agent contracts to OpenClaw gateway")
    .option("--gateway <wsUrl>", "override gateway WS URL")
    .option("--agent <id>", "sync a single agent")
    .option("--dry-run", "show diffs without writing")
    .option("--compile-only", "compile agent files locally without connecting to gateway")
    .option("--out-dir <dir>", "output directory for --compile-only (default: .compiled)")
    .option("--prune", "remove agents not present in repo")
    .option("--yes", "skip confirmation prompts")
    .option("--force", "overwrite agent files even if unchanged")
    .action(async (opts: SyncOptions) => {
      await runSync(opts);
    });
};

async function runSync(opts: SyncOptions): Promise<void> {
  const root = findRepoRoot(process.cwd());
  if (!root) {
    console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
    process.exitCode = 2;
    return;
  }

  const repo = new FileSystemRepo(root);
  const company = await repo.readYaml<CompanyConfig>("company.yaml");
  const gatewayUrl =
    opts.gateway ?? company.defaults?.gateway_ws ?? company.gateway_ws ?? "ws://127.0.0.1:18789";

  const contracts = await loadContracts(repo, opts.agent);
  if (contracts.length === 0) {
    console.error("No agent contracts found.");
    process.exitCode = 1;
    return;
  }

  const validator = createSchemaValidator();
  const validationErrors = validateContracts(validator, contracts);
  if (validationErrors.length > 0) {
    for (const err of validationErrors) {
      console.error(err);
    }
    process.exitCode = 1;
    return;
  }

  if (opts.compileOnly) {
    await runCompileOnly(root, contracts, opts.outDir ?? ".compiled");
    return;
  }

  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  const client = await createGatewayClient(gatewayUrl, { token });

  try {
    const preflightOk = await preflightAgents(client, contracts);
    if (!preflightOk) {
      process.exitCode = 1;
      return;
    }
    const cronJobs = await fetchCronJobs(client);
    const planned: string[] = [];

    for (const contract of contracts) {
      const bundle = await compileAgent(contract);
      await syncAgent(client, contract, bundle, opts, cronJobs, planned);
    }

    if (opts.prune) {
      await maybePruneAgents(client, contracts, opts, planned);
    }

    if (opts.dryRun) {
      if (planned.length === 0) {
        console.log("No changes.");
      } else {
        console.log("Planned changes:");
        for (const line of planned) console.log(`  - ${line}`);
      }
    } else {
      console.log(`Synced ${contracts.length} agent(s).`);
    }
  } finally {
    await client.close();
  }
}

async function runCompileOnly(root: string, contracts: AgentContract[], outDir: string): Promise<void> {
  const base = path.resolve(root, outDir);

  for (const contract of contracts) {
    const bundle = await compileAgent(contract);
    const agentDir = path.join(base, contract.id);
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(path.join(agentDir, "SOUL.md"), bundle.soul);
    await fs.writeFile(path.join(agentDir, "AGENTS.md"), bundle.agents);
    await fs.writeFile(path.join(agentDir, "HEARTBEAT.md"), bundle.heartbeat);
    await fs.writeFile(path.join(agentDir, "cron.json"), JSON.stringify(bundle.cron, null, 2));
    console.log(`  compiled ${contract.id} -> ${outDir}/${contract.id}/`);
  }

  console.log(`\nCompiled ${contracts.length} agent(s) to ${outDir}/`);
}

async function loadContracts(repo: FileSystemRepo, agentFilter?: string): Promise<AgentContract[]> {
  const files = await repo.glob("agents/*.yaml");
  const contracts: AgentContract[] = [];

  for (const file of files) {
    const data = await repo.readYaml<AgentContract>(file);
    if (agentFilter) {
      const base = path.basename(file, path.extname(file));
      if (data.id !== agentFilter && base !== agentFilter) continue;
    }
    contracts.push(data);
  }

  if (agentFilter && contracts.length === 0) {
    console.error(`No agent contract found for "${agentFilter}".`);
  }

  return contracts;
}

function validateContracts(validator: ReturnType<typeof createSchemaValidator>, contracts: AgentContract[]): string[] {
  const errors: string[] = [];

  for (const contract of contracts) {
    const validation = validator.validate(agentSchema as object, contract);
    if (validation.length > 0) {
      for (const err of validation) {
        errors.push(`agents/${contract.id}.yaml: ${err.message} (${err.path ?? "schema"})`);
      }
    }
  }

  return errors;
}

async function syncAgent(
  client: Awaited<ReturnType<typeof createGatewayClient>>,
  contract: AgentContract,
  bundle: AgentBundle,
  opts: SyncOptions,
  cronJobs: unknown[],
  planned: string[],
): Promise<void> {
  await syncAgentFile(client, contract.id, "SOUL.md", bundle.soul, opts, planned);
  await syncAgentFile(client, contract.id, "AGENTS.md", bundle.agents, opts, planned);
  await syncAgentFile(client, contract.id, "HEARTBEAT.md", bundle.heartbeat, opts, planned);

  await syncHeartbeatCron(client, contract.id, bundle.cron, cronJobs, opts, planned);
}

async function syncAgentFile(
  client: Awaited<ReturnType<typeof createGatewayClient>>,
  agentId: string,
  fileName: string,
  desired: string,
  opts: SyncOptions,
  planned: string[],
): Promise<void> {
  let current: string | null = null;
  try {
    const result = await client.request<unknown>("agents.files.get", { agentId, name: fileName });
    current = extractContent(result);
  } catch {
    current = null;
  }

  const changed = opts.force || current === null || current !== desired;
  if (!changed) return;

  if (opts.dryRun) {
    planned.push(`${agentId}: update ${fileName}`);
    return;
  }

  await client.request("agents.files.set", { agentId, name: fileName, content: desired });
}

async function fetchCronJobs(client: Awaited<ReturnType<typeof createGatewayClient>>): Promise<unknown[]> {
  try {
    const result = await client.request<unknown>("cron.list", {});
    if (Array.isArray(result)) return result;
    if (typeof result === "object" && result !== null) {
      const items = (result as { items?: unknown[] }).items;
      if (Array.isArray(items)) return items;
    }
  } catch {
    return [];
  }
  return [];
}

async function syncHeartbeatCron(
  client: Awaited<ReturnType<typeof createGatewayClient>>,
  agentId: string,
  cron: Record<string, unknown>,
  cronJobs: unknown[],
  opts: SyncOptions,
  planned: string[],
): Promise<void> {
  const name = cron.name as string;
  const existing = cronJobs.find((job) => {
    if (typeof job !== "object" || job === null) return false;
    const record = job as Record<string, unknown>;
    return record.name === name;
  }) as Record<string, unknown> | undefined;

  if (opts.dryRun) {
    planned.push(`${agentId}: ${existing ? "update" : "add"} heartbeat cron`);
    return;
  }

  if (existing) {
    const id = (existing.id ?? existing.jobId) as string | undefined;
    await client.request("cron.update", { id, ...cron });
    return;
  }

  await client.request("cron.add", cron);
}

async function maybePruneAgents(
  client: Awaited<ReturnType<typeof createGatewayClient>>,
  contracts: AgentContract[],
  opts: SyncOptions,
  planned: string[],
): Promise<void> {
  if (!opts.yes) {
    console.error("Refusing to prune without --yes.");
    process.exitCode = 1;
    return;
  }

  const desiredIds = new Set(contracts.map((c) => c.id));
  let existing: unknown = [];

  try {
    existing = await client.request<unknown>("agents.list", {});
  } catch {
    return;
  }

  const list = Array.isArray(existing)
    ? existing
    : (existing as { items?: unknown[]; agents?: unknown[] }).items ??
      (existing as { agents?: unknown[] }).agents ??
      [];

  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const id = (record.id ?? record.agentId ?? record.name) as string | undefined;
    if (!id || desiredIds.has(id)) continue;

    if (opts.dryRun) {
      planned.push(`remove agent ${id}`);
      continue;
    }

    await client.request("agents.delete", { agentId: id, deleteFiles: true });
  }
}

function extractContent(result: unknown): string | null {
  if (typeof result === "string") return result;
  if (typeof result === "object" && result !== null) {
    const record = result as Record<string, unknown>;
    if (typeof record.content === "string") return record.content;
    if (typeof record.text === "string") return record.text;
  }
  return null;
}
