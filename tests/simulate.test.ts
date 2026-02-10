import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const CLI = path.resolve(__dirname, "../dist/cli.js");

function run(root: string, args: string[]): string {
  return execFileSync("node", [CLI, ...args], { cwd: root, encoding: "utf-8" });
}

async function setupRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-simulate-"));
  await fs.mkdir(path.join(root, "discussion"), { recursive: true });
  await fs.writeFile(path.join(root, "company.yaml"), "name: test\nversion: 0.1.0\n", "utf-8");

  const content = [
    "---",
    "from: Codex",
    "to: Claude",
    "status: delivering",
    "work_queue_item:",
    "  - semantic-diff",
    "files_changed:",
    "  - src/commands/diff.ts",
    "---",
    "",
    "# Handoff",
    "",
    "**From:** Codex",
    "**To:** Claude",
    "",
    "Body",
    "",
  ].join("\n");

  await fs.writeFile(path.join(root, "discussion/001-codex-response.md"), content, "utf-8");
  return root;
}

describe("company simulate", () => {
  it("writes report and prints pretty summary", async () => {
    const root = await setupRepo();
    const output = run(root, ["simulate"]);
    expect(output).toContain("company simulate");
    expect(output).toContain("reports/simulation.json");

    const reportText = await fs.readFile(path.join(root, "reports/simulation.json"), "utf-8");
    const report = JSON.parse(reportText) as {
      source_file: string;
      manifest_valid: boolean;
      would_create_stub: string | null;
    };
    expect(report.source_file).toBe("discussion/001-codex-response.md");
    expect(report.manifest_valid).toBe(true);
    expect(report.would_create_stub).toBe("discussion/002-claude-response.md");
  });

  it("outputs JSON to stdout and writes report", async () => {
    const root = await setupRepo();
    const output = run(root, ["simulate", "--format", "json"]);
    const stdoutReport = JSON.parse(output) as { source_file: string };
    expect(stdoutReport.source_file).toBe("discussion/001-codex-response.md");

    const fileReport = JSON.parse(
      await fs.readFile(path.join(root, "reports/simulation.json"), "utf-8"),
    ) as { source_file: string };
    expect(fileReport.source_file).toBe("discussion/001-codex-response.md");
  });
});
