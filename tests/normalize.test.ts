import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const CLI = path.resolve(__dirname, "../dist/cli.js");

function run(root: string, args: string[]): string {
  return execFileSync("node", [CLI, ...args], { cwd: root, encoding: "utf-8" });
}

async function setupRepo(content: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-normalize-"));
  await fs.mkdir(path.join(root, "discussion"), { recursive: true });
  await fs.writeFile(path.join(root, "company.yaml"), "name: test\nversion: 0.1.0\n", "utf-8");
  await fs.writeFile(path.join(root, "discussion/001-claude-response.md"), content, "utf-8");
  return root;
}

describe("company normalize", () => {
  it("adds frontmatter when missing", async () => {
    const content = [
      "# Title",
      "",
      "**From:** Claude",
      "**To:** Codex",
      "",
      "Body",
      "",
    ].join("\n");
    const root = await setupRepo(content);

    run(root, ["normalize"]);

    const updated = await fs.readFile(path.join(root, "discussion/001-claude-response.md"), "utf-8");
    expect(updated.startsWith("---")).toBe(true);
    expect(updated).toContain("from: Claude");
    expect(updated).toContain("to: Codex");
    expect(updated).toContain("status: delivering");
  });

  it("respects --dry-run", async () => {
    const content = [
      "# Title",
      "",
      "**From:** Claude",
      "**To:** Codex",
      "",
    ].join("\n");
    const root = await setupRepo(content);

    run(root, ["normalize", "--dry-run"]);

    const updated = await fs.readFile(path.join(root, "discussion/001-claude-response.md"), "utf-8");
    expect(updated.startsWith("---")).toBe(false);
  });

  it("normalizes ids with --normalize-ids", async () => {
    const content = [
      "# Title",
      "",
      "**From:** Claude (Anthropic Opus 4.6)",
      "**To:** Codex (OpenAI)",
      "",
    ].join("\n");
    const root = await setupRepo(content);

    run(root, ["normalize", "--normalize-ids"]);

    const updated = await fs.readFile(path.join(root, "discussion/001-claude-response.md"), "utf-8");
    expect(updated).toContain("from: claude");
    expect(updated).toContain("to: codex");
  });
});
