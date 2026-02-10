import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { Command } from "commander";
import { stringify } from "yaml";

import type { AgentContract } from "../compiler/agent";
import { createGatewayClient } from "../lib/gateway";
import type { HandoffManifest } from "../lib/handoff";
import { appendHandoffLog, createLogEntry, validateHandoffManifest } from "../lib/handoff";
import { FileSystemRepo, findRepoRoot } from "../lib/repo";

const execFileAsync = promisify(execFile);

interface CompanyConfig {
  defaults?: { gateway_ws?: string };
  gateway_ws?: string;
}

interface HandoffOptions {
  gateway?: string;
  to?: string;
  sessionKey?: string;
  dryRun?: boolean;
  send?: boolean;
  noBranch?: boolean;
}

interface CollaborationConfig {
  participants?: { id?: string }[];
}

export const registerHandoffCommand = (program: Command): void => {
  program
    .command("handoff")
    .description("Generate handoff manifest and relay via OpenClaw session")
    .option("--gateway <wsUrl>", "override gateway WS URL")
    .option("--to <agentId>", "target agent id (defaults to handoff manifest)")
    .option("--session-key <key>", "explicit OpenClaw session key")
    .option("--send", "send relay via OpenClaw (default: dry-run)")
    .option("--dry-run", "print relay prompt without sending (default)")
    .option("--no-branch", "skip auto-branch creation")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ company handoff",
        "  $ company handoff --send",
        "  $ company handoff --no-branch",
      ].join("\n"),
    )
    .action(async (opts: HandoffOptions) => {
      await runHandoff(opts);
    });
};

async function runHandoff(opts: HandoffOptions): Promise<void> {
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

  const relayPrompt = await runShuttle(root, opts.noBranch === true);
  const handoff = await repo.readYaml<HandoffManifest>("meta/handoff.yaml");
  const collaboration = await repo.readYaml<CollaborationConfig>("meta/collaboration.yaml");

  const validation = await validateHandoffManifest(handoff, repo);
  for (const warning of validation.warnings) {
    console.warn(`handoff warning: ${warning}`);
  }
  if (!validation.ok) {
    for (const error of validation.errors) {
      console.error(`handoff error: ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  const toField = opts.to ?? handoff.to ?? "";
  const agentId = resolveAgentId(toField, collaboration.participants ?? []);
  if (!agentId) {
    console.error(`Unable to resolve target agent from "${toField}". Use --to <agentId>.`);
    process.exitCode = 1;
    return;
  }

  const toolProfile = await readToolProfile(repo, agentId);
  const message = formatHandoffMessage(relayPrompt, toolProfile);

  if (!opts.send) {
    console.log(message);
    return;
  }

  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (!token) {
    console.error("OPENCLAW_GATEWAY_TOKEN is required for handoff.");
    const failPatch = { status: "failed" as const, sent_at: new Date().toISOString() };
    await writeHandoffStatus(root, handoff, failPatch);
    await appendHandoffLog(root, createLogEntry({ ...handoff, ...failPatch }));
    process.exitCode = 1;
    return;
  }

  const client = await createGatewayClient(gatewayUrl, { token });
  let sessionKey = "";
  try {
    sessionKey = opts.sessionKey ?? (await resolveSessionKey(client, agentId));
    await client.request("chat.send", {
      sessionKey,
      message,
      deliver: true,
      idempotencyKey: randomUUID(),
    });
    const sentPatch = {
      status: "sent" as const,
      sent_at: new Date().toISOString(),
      session_key: sessionKey,
    };
    await writeHandoffStatus(root, handoff, sentPatch);
    await appendHandoffLog(root, createLogEntry({ ...handoff, ...sentPatch }));
    console.log(`Relayed handoff to ${agentId} (${sessionKey}).`);
  } catch (err) {
    const errPatch = {
      status: "failed" as const,
      sent_at: new Date().toISOString(),
      session_key: sessionKey || null,
    };
    await writeHandoffStatus(root, handoff, errPatch);
    await appendHandoffLog(root, createLogEntry({ ...handoff, ...errPatch }));
    throw err;
  } finally {
    await client.close();
  }
}

async function runShuttle(root: string, skipBranch: boolean): Promise<string> {
  const script = path.join(root, "meta", "shuttle.sh");
  const args = skipBranch ? [] : ["--create-branch"];
  const { stdout } = await execFileAsync(script, args, { cwd: root });
  return stdout.toString().trim();
}

function resolveAgentId(toField: string, participants: { id?: string }[]): string | null {
  const trimmed = toField.trim();
  if (!trimmed) return null;

  const normalized = slugify(trimmed);
  const candidateIds = participants
    .map((p) => p.id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.toLowerCase());

  if (candidateIds.includes(normalized)) return normalized;

  const direct = trimmed.toLowerCase();
  if (candidateIds.includes(direct)) return direct;

  return null;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

async function resolveSessionKey(
  client: Awaited<ReturnType<typeof createGatewayClient>>,
  agentId: string,
): Promise<string> {
  const resolved = await client.request<unknown>("sessions.resolve", {
    agentId,
    includeGlobal: true,
    includeUnknown: true,
  });
  if (typeof resolved === "object" && resolved !== null) {
    const record = resolved as Record<string, unknown>;
    if (typeof record.key === "string" && record.key.trim()) return record.key;
  }
  throw new Error(`Failed to resolve session key for agent "${agentId}".`);
}

async function readToolProfile(repo: FileSystemRepo, agentId: string): Promise<string> {
  try {
    const contract = await repo.readYaml<AgentContract>(`agents/${agentId}.yaml`);
    return contract.tools?.profile ?? "safe";
  } catch {
    return "safe";
  }
}

function formatHandoffMessage(prompt: string, profile: string): string {
  const header = `Tool profile: ${profile}`;
  return `${header}\n\n${prompt}`;
}

async function writeHandoffStatus(
  root: string,
  manifest: HandoffManifest,
  patch: Partial<Pick<HandoffManifest, "status" | "sent_at" | "session_key">>,
): Promise<void> {
  const next: HandoffManifest = { ...manifest, ...patch };
  const text = stringify(next);
  const dest = path.join(root, "meta", "handoff.yaml");
  await fs.writeFile(dest, text, "utf-8");
}
