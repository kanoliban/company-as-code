import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const CLI = path.resolve(__dirname, "../dist/cli.js");

async function setupRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-receive-"));
  await fs.mkdir(path.join(root, "discussion"), { recursive: true });
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  await fs.writeFile(path.join(root, "company.yaml"), "name: test\n", "utf-8");
  await fs.writeFile(
    path.join(root, "discussion/001-codex-response.md"),
    "Hello from Codex.\n",
    "utf-8",
  );
  const manifest = [
    "version: 1",
    "source_file: discussion/001-codex-response.md",
    "generated_at: 2026-02-09",
    "from: codex",
    "to: claude",
    "status: pending",
    "",
  ].join("\n");
  await fs.writeFile(path.join(root, "meta/handoff.yaml"), manifest, "utf-8");
  return root;
}

function run(root: string, args: string[]): string {
  return execFileSync("node", [CLI, ...args], { cwd: root, encoding: "utf-8" });
}

describe("company receive", () => {
  it("writes a response stub by default", async () => {
    const root = await setupRepo();
    const output = run(root, ["receive"]).trim();
    expect(output).toBe("discussion/002-claude-response.md");

    const stubPath = path.join(root, output);
    const stub = await fs.readFile(stubPath, "utf-8");
    expect(stub).toContain("**From:** claude");
    expect(stub).toContain("**To:** codex");
    expect(stub).toContain("**Re:** Response to discussion/001-codex-response.md");
  });

  it("outputs JSON and does not write a stub in --format json", async () => {
    const root = await setupRepo();
    const output = run(root, ["receive", "--format", "json"]);
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("manifest");
    expect(parsed.source_file).toBe("discussion/001-codex-response.md");
    expect(parsed.source_text).toContain("Hello from Codex.");

    const maybeStub = path.join(root, "discussion/002-claude-response.md");
    await expect(fs.access(maybeStub)).rejects.toBeDefined();
  });

  it("appends 'received' entry to handoff log (default mode)", async () => {
    const root = await setupRepo();
    run(root, ["receive"]);
    const logText = await fs.readFile(path.join(root, "meta/handoff-log.yaml"), "utf-8");
    expect(logText).toContain("received");
    expect(logText).toContain("codex");
    expect(logText).toContain("claude");
  });

  it("appends 'received' entry to handoff log (JSON mode)", async () => {
    const root = await setupRepo();
    run(root, ["receive", "--format", "json"]);
    const logText = await fs.readFile(path.join(root, "meta/handoff-log.yaml"), "utf-8");
    expect(logText).toContain("received");
  });
});
