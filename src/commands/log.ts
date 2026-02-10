import type { Command } from "commander";

import { readHandoffLog } from "../lib/handoff";
import { findRepoRoot } from "../lib/repo";

interface LogOptions {
  limit: string;
  format: string;
}

export const registerLogCommand = (program: Command): void => {
  program
    .command("log")
    .description("Show handoff history log")
    .option("--limit <n>", "number of entries to show", "10")
    .option("--format <format>", "output format (pretty|json)", "pretty")
    .action(async (opts: LogOptions) => {
      await runLog(opts);
    });
};

async function runLog(opts: LogOptions): Promise<void> {
  const root = findRepoRoot(process.cwd());
  if (!root) {
    console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
    process.exitCode = 2;
    return;
  }

  const limit = Math.max(1, Number(opts.limit) || 10);
  const log = await readHandoffLog(root);

  if (log.entries.length === 0) {
    if (opts.format === "json") {
      console.log(JSON.stringify([], null, 2));
    } else {
      console.log("(no handoff log entries)");
    }
    return;
  }

  const entries = log.entries.slice(-limit);

  if (opts.format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (opts.format !== "pretty") {
    console.error(`Unknown format: ${opts.format}`);
    process.exitCode = 1;
    return;
  }

  const header = padRow("STATUS", "FROM", "TO", "SOURCE", "SENT_AT");
  const separator = padRow("------", "----", "--", "------", "-------");
  console.log(header);
  console.log(separator);
  for (const entry of entries) {
    console.log(
      padRow(
        entry.status,
        entry.from,
        entry.to,
        entry.source_file,
        entry.sent_at ?? "-",
      ),
    );
  }
}

function padRow(status: string, from: string, to: string, source: string, sentAt: string): string {
  return [
    status.padEnd(10),
    from.padEnd(10),
    to.padEnd(10),
    source.padEnd(40),
    sentAt,
  ].join("  ");
}
