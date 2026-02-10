import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const CLI = path.resolve(__dirname, "../dist/cli.js");

async function setupRepo(entryCount: number): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-log-"));
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  await fs.writeFile(path.join(root, "company.yaml"), "name: test\n", "utf-8");

  if (entryCount > 0) {
    const entries = Array.from({ length: entryCount }, (_, i) => ({
      source_file: `discussion/${String(i + 1).padStart(3, "0")}-codex-response.md`,
      from: "codex",
      to: "claude",
      status: i === entryCount - 1 ? "received" : "sent",
      generated_at: "2026-02-09",
      sent_at: `2026-02-09T0${i}:00:00Z`,
      branch: null,
    }));
    const log = { version: 1, max_entries: 50, entries };
    const { stringify } = await import("yaml");
    await fs.writeFile(path.join(root, "meta/handoff-log.yaml"), stringify(log), "utf-8");
  }

  return root;
}

function run(root: string, args: string[]): string {
  return execFileSync("node", [CLI, ...args], { cwd: root, encoding: "utf-8" });
}

describe("company log", () => {
  it("prints empty message when no log exists", async () => {
    const root = await setupRepo(0);
    const output = run(root, ["log"]).trim();
    expect(output).toBe("(no handoff log entries)");
  });

  it("prints table with entries", async () => {
    const root = await setupRepo(3);
    const output = run(root, ["log"]);
    expect(output).toContain("STATUS");
    expect(output).toContain("FROM");
    expect(output).toContain("codex");
    expect(output).toContain("claude");
    expect(output).toContain("received");
    expect(output).toContain("sent");
  });

  it("respects --limit", async () => {
    const root = await setupRepo(5);
    const output = run(root, ["log", "--limit", "2"]);
    const dataLines = output.trim().split("\n").filter((l) => l.includes("codex"));
    expect(dataLines).toHaveLength(2);
  });

  it("outputs JSON array with --format json", async () => {
    const root = await setupRepo(3);
    const output = run(root, ["log", "--format", "json"]);
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed[2].status).toBe("received");
  });

  it("outputs empty JSON array when no log exists", async () => {
    const root = await setupRepo(0);
    const output = run(root, ["log", "--format", "json"]);
    const parsed = JSON.parse(output);
    expect(parsed).toEqual([]);
  });
});
