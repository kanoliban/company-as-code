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

async function setupPluginRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-plugin-"));
  await fs.writeFile(path.join(root, "company.yaml"), "name: test\nversion: 1.0.0\n", "utf-8");
  const pluginDir = path.join(root, "plugins", "example");
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, "plugin.yaml"),
    [
      "id: example",
      "name: Example Plugin",
      "description: Prints a message",
      "commands:",
      "  default:",
      "    cmd: node",
      "    args: [\"-e\", \"console.log('plugin-ok')\"]",
    ].join("\n"),
    "utf-8",
  );
  return root;
}

async function setupEmptyRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-plugin-init-"));
  await fs.writeFile(path.join(root, "company.yaml"), "name: test\nversion: 1.0.0\n", "utf-8");
  return root;
}

describe("company plugin", () => {
  it("lists plugins", async () => {
    const root = await setupPluginRepo();
    const result = run(root, ["plugin", "list"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("example");
    expect(result.stdout).toContain("commands");
  });

  it("runs a plugin command", async () => {
    const root = await setupPluginRepo();
    const result = run(root, ["plugin", "run", "example"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("plugin-ok");
  });

  it("prints a dry-run payload", async () => {
    const root = await setupPluginRepo();
    const result = run(root, ["plugin", "run", "example", "--dry-run"]);
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.cmd).toBe("node");
    expect(payload.args).toEqual(["-e", "console.log('plugin-ok')"]);
    const expected = await fs.realpath(root);
    const actual = await fs.realpath(payload.cwd);
    expect(actual).toBe(expected);
  });

  it("scaffolds a plugin manifest", async () => {
    const root = await setupEmptyRepo();
    const result = run(root, ["plugin", "init", "My Tool", "--description", "Test plugin"]);
    expect(result.code).toBe(0);
    const manifest = await fs.readFile(path.join(root, "plugins", "my-tool", "plugin.yaml"), "utf-8");
    expect(manifest).toContain("id: my-tool");
    expect(manifest).toContain("name: My Tool");
    expect(manifest).toContain("description: Test plugin");
  });

  it("refuses to overwrite without --force", async () => {
    const root = await setupEmptyRepo();
    const first = run(root, ["plugin", "init", "example"]);
    expect(first.code).toBe(0);
    const second = run(root, ["plugin", "init", "example"]);
    expect(second.code).toBe(1);
    expect(second.stderr).toContain("Refusing to overwrite existing plugin manifest");
  });
});
