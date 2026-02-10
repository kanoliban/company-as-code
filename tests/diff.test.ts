import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const CLI = path.resolve(__dirname, "../dist/cli.js");

function run(root: string, args: string[]): string {
  return execFileSync("node", [CLI, ...args], { cwd: root, encoding: "utf-8" });
}

async function initGitRepo(root: string): Promise<void> {
  execFileSync("git", ["-C", root, "init"], { encoding: "utf-8" });
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"], { encoding: "utf-8" });
  execFileSync("git", ["-C", root, "config", "user.name", "Test"], { encoding: "utf-8" });
}

async function commitAll(root: string, message: string): Promise<void> {
  execFileSync("git", ["-C", root, "add", "."], { encoding: "utf-8" });
  execFileSync("git", ["-C", root, "commit", "-m", message], { encoding: "utf-8" });
}

describe("company diff", () => {
  it("outputs grouped JSON", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-diff-"));
    await fs.mkdir(path.join(root, "state"), { recursive: true });
    await fs.mkdir(path.join(root, "meta"), { recursive: true });
    await fs.writeFile(path.join(root, "company.yaml"), "name: test\n", "utf-8");

    await initGitRepo(root);
    await fs.writeFile(path.join(root, "state/objectives.yaml"), "items: []\n", "utf-8");
    await commitAll(root, "initial");

    await fs.writeFile(path.join(root, "state/objectives.yaml"), "items:\n  - id: next\n", "utf-8");
    await fs.writeFile(path.join(root, "meta/work-queue.yaml"), "items: []\n", "utf-8");
    await commitAll(root, "add work queue");

    const output = run(root, ["diff", "--format", "json"]);
    const parsed = JSON.parse(output) as {
      groups: Record<string, string[]>;
      total: number;
    };

    expect(parsed.total).toBeGreaterThan(0);
    expect(parsed.groups.state).toBeDefined();
    expect(parsed.groups.meta).toBeDefined();
  });

  it("prints pretty output", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-diff-"));
    await fs.mkdir(path.join(root, "state"), { recursive: true });
    await fs.writeFile(path.join(root, "company.yaml"), "name: test\n", "utf-8");

    await initGitRepo(root);
    await fs.writeFile(path.join(root, "state/objectives.yaml"), "items: []\n", "utf-8");
    await commitAll(root, "initial");

    await fs.writeFile(path.join(root, "state/risks.yaml"), "items: []\n", "utf-8");
    await commitAll(root, "add risks");

    const output = run(root, ["diff"]);
    expect(output).toContain("company diff");
    expect(output).toContain("state/risks.yaml");
  });

  it("outputs semantic JSON for state + work queue", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-diff-"));
    await fs.mkdir(path.join(root, "state"), { recursive: true });
    await fs.mkdir(path.join(root, "meta"), { recursive: true });
    await fs.writeFile(path.join(root, "company.yaml"), "name: test\n", "utf-8");

    await initGitRepo(root);
    await fs.writeFile(
      path.join(root, "state/objectives.yaml"),
      "items:\n  - id: alpha\n    title: Alpha\n",
      "utf-8",
    );
    await fs.writeFile(
      path.join(root, "meta/work-queue.yaml"),
      "items:\n  - id: task-a\n    status: ready\n",
      "utf-8",
    );
    await commitAll(root, "initial");

    await fs.writeFile(
      path.join(root, "state/objectives.yaml"),
      "items:\n  - id: alpha\n    title: Alpha v2\n  - id: beta\n    title: Beta\n",
      "utf-8",
    );
    await fs.writeFile(
      path.join(root, "meta/work-queue.yaml"),
      "items:\n  - id: task-a\n    status: done\n  - id: task-b\n    status: ready\n",
      "utf-8",
    );
    await commitAll(root, "update");

    const output = run(root, ["diff", "--semantic", "--format", "json"]);
    const parsed = JSON.parse(output) as {
      files: Array<{ file: string; type: string; added?: string[]; removed?: string[]; changed?: string[]; status_changed?: Array<{ id: string; from: string; to: string }> }>;
    };

    const stateEntry = parsed.files.find((entry) => entry.file === "state/objectives.yaml");
    expect(stateEntry?.type).toBe("state");
    expect(stateEntry?.added).toContain("beta");
    expect(stateEntry?.changed).toContain("alpha");

    const wqEntry = parsed.files.find((entry) => entry.file === "meta/work-queue.yaml");
    expect(wqEntry?.type).toBe("work_queue");
    expect(wqEntry?.added).toContain("task-b");
    expect(wqEntry?.status_changed?.[0]?.id).toBe("task-a");
  });
});
