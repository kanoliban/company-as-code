import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const CLI = path.resolve(__dirname, "../dist/cli.js");

function run(root: string, args: string[]): { stdout: string; stderr: string; code: number | null } {
  const result = spawnSync("node", [CLI, ...args], { cwd: root, encoding: "utf-8" });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    code: result.status,
  };
}

async function setupRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-hardening-"));
  await fs.writeFile(path.join(root, "company.yaml"), "name: test\nversion: 0.1.0\n", "utf-8");
  return root;
}

describe("edge-case errors", () => {
  it("reports non-git repo for company diff", async () => {
    const root = await setupRepo();
    const result = run(root, ["diff"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Not a git repository");
  });

  it("reports missing discussion for company simulate", async () => {
    const root = await setupRepo();
    const result = run(root, ["simulate"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("No discussion/*-response.md files found.");
  });

  it("reports missing agents for company sync", async () => {
    const root = await setupRepo();
    const result = run(root, ["sync", "--compile-only"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("No agent contracts found.");
  });
});
