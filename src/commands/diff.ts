import { execFileSync } from "node:child_process";

import type { Command } from "commander";

import { findRepoRoot } from "../lib/repo";

interface DiffOptions {
  from?: string;
  to?: string;
  format: string;
  semantic?: boolean;
}

const KNOWN_GROUPS = new Set([
  "state",
  "canon",
  "interfaces",
  "agents",
  "meta",
  "checks",
  "decisions",
  "artifacts",
  "reports",
  "discussion",
  "design",
]);

export const registerDiffCommand = (program: Command): void => {
  program
    .command("diff")
    .description("Compare repo changes between two git refs")
    .option("--from <ref>", "git ref to diff from", "HEAD~1")
    .option("--to <ref>", "git ref to diff to", "HEAD")
    .option("--format <format>", "output format (pretty|json)", "pretty")
    .option("--semantic", "use semantic YAML diff for known files")
    .action(async (opts: DiffOptions) => {
      await runDiff(opts);
    });
};

async function runDiff(opts: DiffOptions): Promise<void> {
  const root = findRepoRoot(process.cwd());
  if (!root) {
    console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
    process.exitCode = 2;
    return;
  }

  const from = opts.from ?? "HEAD~1";
  const to = opts.to ?? "HEAD";

  let output = "";
  try {
    output = execFileSync("git", ["-C", root, "diff", "--name-only", `${from}..${to}`], {
      encoding: "utf-8",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not a git repository")) {
      console.error("Not a git repository. Run `git init` or use this command inside a git repo.");
    } else {
      console.error("Failed to run git diff.");
      console.error(message);
    }
    process.exitCode = 1;
    return;
  }

  const files = output.split("\n").map((line) => line.trim()).filter(Boolean);

  if (opts.semantic) {
    await runSemanticDiff({ root, from, to, files, format: opts.format });
    return;
  }

  const groups = groupFiles(files);

  if (opts.format === "json") {
    const payload = {
      from,
      to,
      groups,
      total: files.length,
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (opts.format !== "pretty") {
    console.error(`Unknown format: ${opts.format}`);
    process.exitCode = 1;
    return;
  }

  if (files.length === 0) {
    console.log("No changes.");
    return;
  }

  console.log(`company diff (${from}..${to})`);
  const sortedGroups = Object.keys(groups).sort();
  for (const group of sortedGroups) {
    const entries = groups[group];
    console.log("");
    console.log(`${group} (${entries.length})`);
    for (const file of entries) {
      console.log(file);
    }
  }
}

function groupFiles(files: string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const file of files) {
    const segment = file.includes("/") ? file.split("/")[0] : "root";
    const group = KNOWN_GROUPS.has(segment) ? segment : segment === "root" ? "root" : "other";
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(file);
  }
  for (const key of Object.keys(grouped)) {
    grouped[key].sort();
  }
  return grouped;
}

interface SemanticDiffOptions {
  root: string;
  from: string;
  to: string;
  files: string[];
  format: string;
}

type SemanticFileChange =
  | {
      file: string;
      type: "state";
      added: string[];
      removed: string[];
      changed: string[];
    }
  | {
      file: string;
      type: "work_queue";
      added: string[];
      removed: string[];
      status_changed: Array<{ id: string; from: string | null; to: string | null }>;
    };

interface SemanticDiffReport {
  from: string;
  to: string;
  files: SemanticFileChange[];
  skipped_files: string[];
  total_files: number;
}

async function runSemanticDiff(opts: SemanticDiffOptions): Promise<void> {
  const semanticFiles: SemanticFileChange[] = [];
  const skipped: string[] = [];

  for (const file of opts.files) {
    if (file.startsWith("state/") && file.endsWith(".yaml")) {
      const change = semanticStateFile(opts.root, opts.from, opts.to, file);
      if (change) semanticFiles.push(change);
      continue;
    }
    if (file === "meta/work-queue.yaml") {
      const change = semanticWorkQueue(opts.root, opts.from, opts.to, file);
      if (change) semanticFiles.push(change);
      continue;
    }
    skipped.push(file);
  }

  const report: SemanticDiffReport = {
    from: opts.from,
    to: opts.to,
    files: semanticFiles,
    skipped_files: skipped,
    total_files: opts.files.length,
  };

  if (opts.format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (opts.format !== "pretty") {
    console.error(`Unknown format: ${opts.format}`);
    process.exitCode = 1;
    return;
  }

  if (opts.files.length === 0) {
    console.log("No changes.");
    return;
  }

  console.log(`company diff --semantic (${opts.from}..${opts.to})`);
  if (semanticFiles.length === 0) {
    console.log("\n(no semantic changes detected)");
    return;
  }

  for (const change of semanticFiles) {
    console.log(`\n${change.file}`);
    if (change.type === "state") {
      printList("added", change.added);
      printList("removed", change.removed);
      printList("changed", change.changed);
    } else {
      printList("added", change.added);
      printList("removed", change.removed);
      if (change.status_changed.length > 0) {
        console.log("  status:");
        for (const entry of change.status_changed) {
          console.log(`    ${entry.id}: ${entry.from ?? "-"} -> ${entry.to ?? "-"}`);
        }
      } else {
        console.log("  status: (none)");
      }
    }
  }
}

function printList(label: string, items: string[]): void {
  if (items.length === 0) {
    console.log(`  ${label}: (none)`);
    return;
  }
  console.log(`  ${label}: ${items.join(", ")}`);
}

function semanticStateFile(root: string, from: string, to: string, file: string): SemanticFileChange | null {
  const before = parseYamlSafe(readFileAtRef(root, from, file));
  const after = parseYamlSafe(readFileAtRef(root, to, file));

  const beforeMap = mapItemsById(before);
  const afterMap = mapItemsById(after);

  const added = diffKeys(afterMap, beforeMap);
  const removed = diffKeys(beforeMap, afterMap);
  const changed: string[] = [];

  for (const id of Object.keys(beforeMap)) {
    if (!(id in afterMap)) continue;
    if (!deepEqual(beforeMap[id], afterMap[id])) {
      changed.push(id);
    }
  }

  return {
    file,
    type: "state",
    added,
    removed,
    changed,
  };
}

function semanticWorkQueue(root: string, from: string, to: string, file: string): SemanticFileChange | null {
  const before = parseYamlSafe(readFileAtRef(root, from, file));
  const after = parseYamlSafe(readFileAtRef(root, to, file));

  const beforeMap = mapItemsById(before);
  const afterMap = mapItemsById(after);

  const added = diffKeys(afterMap, beforeMap);
  const removed = diffKeys(beforeMap, afterMap);
  const status_changed: Array<{ id: string; from: string | null; to: string | null }> = [];

  for (const id of Object.keys(beforeMap)) {
    if (!(id in afterMap)) continue;
    const beforeStatus = getStatus(beforeMap[id]);
    const afterStatus = getStatus(afterMap[id]);
    if (beforeStatus !== afterStatus) {
      status_changed.push({ id, from: beforeStatus, to: afterStatus });
    }
  }

  return {
    file,
    type: "work_queue",
    added,
    removed,
    status_changed,
  };
}

function readFileAtRef(root: string, ref: string, file: string): string | null {
  try {
    return execFileSync("git", ["-C", root, "show", `${ref}:${file}`], { encoding: "utf-8" });
  } catch {
    return null;
  }
}

function parseYamlSafe(input: string | null): Record<string, unknown> {
  if (!input) return {};
  try {
    // Lazy import to avoid adding to hot path for non-semantic diff.
    const { parse } = require("yaml") as { parse: (text: string) => unknown };
    const parsed = parse(input);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // ignore
  }
  return {};
}

function mapItemsById(data: Record<string, unknown>): Record<string, unknown> {
  const items = Array.isArray(data.items) ? data.items : [];
  const map: Record<string, unknown> = {};
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string") continue;
    map[record.id] = record;
  }
  return map;
}

function diffKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return Object.keys(a).filter((key) => !(key in b)).sort();
}

function getStatus(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  return typeof record.status === "string" ? record.status : null;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}
