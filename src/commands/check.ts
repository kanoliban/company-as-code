import type { Command } from "commander";

import type { CheckSeverity } from "../checks/runner";
import { formatJson, formatPretty, runChecks } from "../checks/runner";
import { FileSystemRepo, findRepoRoot } from "../lib/repo";

export const registerCheckCommand = (program: Command): void => {
  program
    .command("check")
    .description("Run organizational tests")
    .option("--id <checkId>", "run a specific check")
    .option("--severity <level>", "filter by severity (error|warning|info)")
    .option("--format <format>", "output format (pretty|json)", "pretty")
    .option("--scope <glob>", "restrict checks to a file glob")
    .action(async (opts: { id?: string; severity?: string; format: string; scope?: string }) => {
      const root = findRepoRoot(process.cwd());
      if (!root) {
        console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
        process.exitCode = 2;
        return;
      }

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
      }
    });
};
