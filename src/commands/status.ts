import type { Command } from "commander";

import { runChecks } from "../checks/runner";
import { readHandoffLog } from "../lib/handoff";
import { FileSystemRepo, findRepoRoot } from "../lib/repo";

interface StatusOptions {
  format: string;
}

interface WorkQueueItem {
  id: string;
  status: string;
}

interface WorkQueueFile {
  items?: WorkQueueItem[];
}

interface StatusSummary {
  handoff: {
    last: unknown | null;
    log_entries: number;
    max_entries: number;
  };
  work_queue: {
    total: number;
    by_status: Record<string, number>;
  };
  checks: {
    passed: number;
    failed: number;
    warnings: number;
  };
}

export const registerStatusCommand = (program: Command): void => {
  program
    .command("status")
    .description("Show a repo status summary")
    .option("--format <format>", "output format (pretty|json)", "pretty")
    .action(async (opts: StatusOptions) => {
      const root = findRepoRoot(process.cwd());
      if (!root) {
        console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
        process.exitCode = 2;
        return;
      }

      const repo = new FileSystemRepo(root);
      const summary = await buildStatusSummary(repo, root);

      if (opts.format === "json") {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log(formatStatus(summary));
      }
    });
};

async function buildStatusSummary(repo: FileSystemRepo, root: string): Promise<StatusSummary> {
  const [handoffLog, checks, workQueue] = await Promise.all([
    readHandoffLog(root),
    runChecks({ repo }),
    readWorkQueue(repo),
  ]);

  const last = handoffLog.entries.length > 0 ? handoffLog.entries[handoffLog.entries.length - 1] : null;
  const byStatus: Record<string, number> = {};
  for (const item of workQueue.items) {
    const status = item.status ?? "unknown";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return {
    handoff: {
      last,
      log_entries: handoffLog.entries.length,
      max_entries: handoffLog.max_entries,
    },
    work_queue: {
      total: workQueue.items.length,
      by_status: byStatus,
    },
    checks: {
      passed: checks.passed,
      failed: checks.failed,
      warnings: checks.warnings,
    },
  };
}

async function readWorkQueue(repo: FileSystemRepo): Promise<{ items: WorkQueueItem[] }> {
  const exists = await repo.exists("meta/work-queue.yaml");
  if (!exists) return { items: [] };
  const data = await repo.readYaml<WorkQueueFile>("meta/work-queue.yaml");
  return { items: data.items ?? [] };
}

function formatStatus(summary: StatusSummary): string {
  const lines: string[] = ["company status", ""];

  lines.push("  🤝 Handoff");
  if (summary.handoff.last) {
    const last = summary.handoff.last as Record<string, unknown>;
    const from = String(last.from ?? "");
    const to = String(last.to ?? "");
    const status = String(last.status ?? "");
    const source = String(last.source_file ?? "");
    const when = String(last.sent_at ?? last.generated_at ?? "");
    lines.push(`    ${status} ${from} -> ${to}`);
    if (source) lines.push(`    source: ${source}`);
    if (when) lines.push(`    at: ${when}`);
  } else {
    lines.push("    (no handoffs yet)");
  }
  lines.push(`    log: ${summary.handoff.log_entries}/${summary.handoff.max_entries}`);
  lines.push("");

  lines.push("  📋 Work Queue");
  lines.push(`    total: ${summary.work_queue.total}`);
  for (const [status, count] of Object.entries(summary.work_queue.by_status)) {
    lines.push(`    ${status}: ${count}`);
  }
  lines.push("");

  lines.push("  ✅ Checks");
  lines.push(`    passed: ${summary.checks.passed}`);
  lines.push(`    failed: ${summary.checks.failed}`);
  lines.push(`    warnings: ${summary.checks.warnings}`);

  return lines.join("\n");
}
