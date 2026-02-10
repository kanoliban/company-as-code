import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const CLI = path.resolve(__dirname, "../dist/cli.js");

function run(root: string, args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { cwd: root, encoding: "utf-8" });
    return { stdout, status: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

async function setupRepo(companyYaml: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-validate-"));
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  await fs.writeFile(path.join(root, "company.yaml"), companyYaml, "utf-8");
  return root;
}

describe("company validate", () => {
  it("passes on a valid repo", async () => {
    const root = await setupRepo("id: test\nname: Test\nversion: 0.1.0\n");
    const { stdout, status } = run(root, ["validate"]);
    expect(status).toBe(0);
    expect(stdout).toContain("0 errors");
  });

  it("reports missing version in company.yaml", async () => {
    const root = await setupRepo("id: test\nname: Test\n");
    const { stdout, status } = run(root, ["validate"]);
    expect(status).toBe(1);
    expect(stdout).toContain("version is required");
  });

  it("validates agent files", async () => {
    const root = await setupRepo("id: test\nname: Test\nversion: 0.1.0\n");
    await fs.mkdir(path.join(root, "agents"), { recursive: true });
    await fs.writeFile(path.join(root, "agents/bad.yaml"), "id: bad\n", "utf-8");
    const { stdout, status } = run(root, ["validate"]);
    expect(status).toBe(1);
    expect(stdout).toContain("missing required field: name");
    expect(stdout).toContain("missing required field: mission");
  });

  it("detects agent filename/id mismatch", async () => {
    const root = await setupRepo("id: test\nname: Test\nversion: 0.1.0\n");
    await fs.mkdir(path.join(root, "agents"), { recursive: true });
    await fs.writeFile(
      path.join(root, "agents/wrong-name.yaml"),
      "id: actual-id\nname: Agent\nmission: Do stuff\ninputs: []\noutputs: []\n",
      "utf-8",
    );
    const { stdout, status } = run(root, ["validate"]);
    expect(status).toBe(1);
    expect(stdout).toContain("does not match id");
  });

  it("detects duplicate work queue ids", async () => {
    const root = await setupRepo("id: test\nname: Test\nversion: 0.1.0\n");
    const wq = "items:\n  - id: foo\n    status: ready\n  - id: foo\n    status: done\n";
    await fs.writeFile(path.join(root, "meta/work-queue.yaml"), wq, "utf-8");
    const { stdout, status } = run(root, ["validate"]);
    expect(status).toBe(1);
    expect(stdout).toContain("duplicate item id: foo");
  });

  it("validates plugin manifests", async () => {
    const root = await setupRepo("id: test\nname: Test\nversion: 0.1.0\n");
    const pluginDir = path.join(root, "plugins", "bad-plugin");
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(path.join(pluginDir, "plugin.yaml"), "id: wrong\ncommands: {}\n", "utf-8");
    const { stdout, status } = run(root, ["validate"]);
    expect(status).toBe(1);
    expect(stdout).toContain("plugins/bad-plugin/plugin.yaml");
    expect(stdout).toContain("does not match folder");
    expect(stdout).toContain("commands must define at least one command");
  });

  it("supports section filtering", async () => {
    const root = await setupRepo("id: test\nname: Test\nversion: 0.1.0\n");
    await fs.mkdir(path.join(root, "agents"), { recursive: true });
    await fs.writeFile(path.join(root, "agents/bad.yaml"), "id: bad\n", "utf-8");
    const { stdout, status } = run(root, ["validate", "--section", "plugins"]);
    expect(status).toBe(0);
    expect(stdout).toContain("0 errors");
  });

  it("errors when required section file is missing", async () => {
    const root = await setupRepo("id: test\nname: Test\nversion: 0.1.0\n");
    const { stdout, status } = run(root, ["validate", "--section", "work-queue"]);
    expect(status).toBe(1);
    expect(stdout).toContain("meta/work-queue.yaml");
    expect(stdout).toContain("file not found");
  });

  it("outputs JSON", async () => {
    const root = await setupRepo("id: test\nname: Test\nversion: 0.1.0\n");
    const { stdout, status } = run(root, ["validate", "--format", "json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.files_checked).toBeGreaterThanOrEqual(1);
    expect(parsed.sections_checked).toContain("company");
  });
});
