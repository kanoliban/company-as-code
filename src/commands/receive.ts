import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { Command } from "commander";
import { parse as parseYaml } from "yaml";

import type { HandoffManifest } from "../lib/handoff";
import { appendHandoffLog, createLogEntry, validateHandoffManifest } from "../lib/handoff";
import { FileSystemRepo, findRepoRoot } from "../lib/repo";

interface ReceiveOptions {
  manifest?: string;
  format: string;
}

export const registerReceiveCommand = (program: Command): void => {
  program
    .command("receive")
    .description("Consume a handoff manifest and prepare a response stub")
    .option("--manifest <path>", "path to handoff manifest", "meta/handoff.yaml")
    .option("--format <format>", "output format (pretty|json)", "pretty")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ company receive",
        "  $ company receive --format json",
      ].join("\n"),
    )
    .action(async (opts: ReceiveOptions) => {
      await runReceive(opts);
    });
};

async function runReceive(opts: ReceiveOptions): Promise<void> {
  const root = findRepoRoot(process.cwd());
  if (!root) {
    console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
    process.exitCode = 2;
    return;
  }

  const repo = new FileSystemRepo(root);
  const manifestPath = opts.manifest ?? "meta/handoff.yaml";
  let manifest: HandoffManifest;
  try {
    manifest = await readManifest(root, manifestPath);
  } catch (err) {
    console.error(`Unable to read manifest at ${manifestPath}.`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  const validation = await validateHandoffManifest(manifest, repo);
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

  if (!manifest.source_file) {
    console.error("handoff error: source_file is required");
    process.exitCode = 1;
    return;
  }

  const sourceText = await readSourceText(root, manifest.source_file);

  if (opts.format === "json") {
    const payload = {
      manifest,
      source_file: manifest.source_file,
      source_text: sourceText,
    };
    console.log(JSON.stringify(payload, null, 2));
    await appendHandoffLog(root, createLogEntry({ ...manifest, status: "received", sent_at: new Date().toISOString() }));
    return;
  }

  if (opts.format !== "pretty") {
    console.error(`Unknown format: ${opts.format}`);
    process.exitCode = 1;
    return;
  }

  if (!manifest.to || !manifest.from) {
    console.error("handoff error: from/to are required to generate a response stub");
    process.exitCode = 1;
    return;
  }

  const targetId = slugify(manifest.to);
  if (!targetId) {
    console.error("handoff error: to is not a valid identifier");
    process.exitCode = 1;
    return;
  }

  const nextNumber = await nextDiscussionNumber(repo);
  const fileName = `${String(nextNumber).padStart(3, "0")}-${targetId}-response.md`;
  const responsePath = path.posix.join("discussion", fileName);

  const exists = await repo.exists(responsePath);
  if (exists) {
    console.error(`handoff error: response file already exists at ${responsePath}`);
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(path.join(root, "discussion"), { recursive: true });
  const stub = buildStub({
    from: manifest.to,
    to: manifest.from,
    re: manifest.source_file,
    date: new Date().toISOString().slice(0, 10),
  });
  await fs.writeFile(path.join(root, responsePath), stub, "utf-8");
  await appendHandoffLog(root, createLogEntry({ ...manifest, status: "received", sent_at: new Date().toISOString() }));
  console.log(responsePath);
}

async function readManifest(root: string, manifestPath: string): Promise<HandoffManifest> {
  const resolved = path.isAbsolute(manifestPath) ? manifestPath : path.join(root, manifestPath);
  const text = await fs.readFile(resolved, "utf-8");
  return parseYaml(text) as HandoffManifest;
}

async function readSourceText(root: string, sourceFile: string): Promise<string> {
  const resolved = path.isAbsolute(sourceFile) ? sourceFile : path.join(root, sourceFile);
  return fs.readFile(resolved, "utf-8");
}

async function nextDiscussionNumber(repo: FileSystemRepo): Promise<number> {
  const files = await repo.glob("discussion/*-response.md");
  let max = 0;
  for (const file of files) {
    const match = file.match(/^discussion\/(\d{3})-.*-response\.md$/);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num)) max = Math.max(max, num);
  }
  return max + 1;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function buildStub({
  from,
  to,
  re,
  date,
}: {
  from: string;
  to: string;
  re: string;
  date: string;
}): string {
  return [
    "# Response",
    "",
    `**From:** ${from}`,
    `**To:** ${to}`,
    `**Re:** Response to ${re}`,
    `**Date:** ${date}`,
    "",
    "---",
    "",
    "[Content]",
    "",
    "---",
    "",
    "## Open Questions",
    "-",
    "",
    "## Proposals",
    "-",
    "",
  ].join("\n");
}
