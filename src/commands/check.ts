import * as fs from "node:fs";
import * as path from "node:path";

import type { Command } from "commander";

import type { CheckListEntry, CheckSeverity } from "../checks/runner";
import { formatJson, formatPretty, listChecks, runChecks } from "../checks/runner";
import { FileSystemRepo, findRepoRoot } from "../lib/repo";

interface CheckOptions {
  id?: string;
  severity?: string;
  format: string;
  scope?: string;
  watch?: boolean;
  list?: boolean;
}

const WATCH_IGNORE = new Set(["node_modules", ".git", "dist", ".compiled"]);
const WATCH_IGNORE_FILES = new Set(["meta/handoff-log.yaml"]);
const WATCH_DEBOUNCE_MS = 300;

export const registerCheckCommand = (program: Command): void => {
  program
    .command("check")
    .description("Run organizational tests")
    .option("--id <checkId>", "run a specific check")
    .option("--severity <level>", "filter by severity (error|warning|info)")
    .option("--format <format>", "output format (pretty|json)", "pretty")
    .option("--scope <glob>", "restrict checks to a file glob")
    .option("--watch", "re-run checks on file changes")
    .option("--list", "list all available checks without running them")
    .action(async (opts: CheckOptions) => {
      const root = findRepoRoot(process.cwd());
      if (!root) {
        console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
        process.exitCode = 2;
        return;
      }

      if (opts.list) {
        await printCheckList(root, opts);
        return;
      }

      await runAndPrint(root, opts);

      if (opts.watch) {
        watchAndRerun(root, opts);
      }
    });
};

async function printCheckList(root: string, opts: CheckOptions): Promise<void> {
  const repo = new FileSystemRepo(root);
  const entries = await listChecks({
    repo,
    filterId: opts.id,
    filterSeverity: opts.severity as CheckSeverity | undefined,
    filterScope: opts.scope,
  });

  if (opts.format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log("No checks found.");
    return;
  }

  console.log("Available checks:\n");
  for (const entry of entries) {
    const desc = entry.description ? ` — ${entry.description}` : "";
    console.log(`  ${entry.id}  [${entry.severity}] [${entry.source}]${desc}`);
    console.log(`    scope: ${entry.scope}`);
  }
  console.log(`\n  ${entries.length} check(s) total`);
}

async function runAndPrint(root: string, opts: CheckOptions): Promise<void> {
  const repo = new FileSystemRepo(root);
  const summary = await runChecks({
    repo,
    filterId: opts.id,
    filterSeverity: opts.severity as CheckSeverity | undefined,
    filterScope: opts.scope,
  });

  if (opts.format === "json") {
    console.log(formatJson(summary));
  } else {
    console.log(formatPretty(summary));
  }

  if (summary.failed > 0) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

function watchAndRerun(root: string, opts: CheckOptions): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    if (shouldIgnore(filename)) return;

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`\n--- re-running checks (${filename}) ---\n`);
      runAndPrint(root, opts).catch((err) => {
        console.error("check error:", err instanceof Error ? err.message : String(err));
      });
    }, WATCH_DEBOUNCE_MS);
  });

  console.log("\nWatching for changes... (Ctrl+C to stop)\n");

  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });
}

function shouldIgnore(filename: string): boolean {
  const first = filename.split(path.sep)[0];
  if (WATCH_IGNORE.has(first)) return true;
  const normalized = filename.split(path.sep).join("/");
  if (WATCH_IGNORE_FILES.has(normalized)) return true;
  return false;
}
