import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const CLI = path.resolve(__dirname, "../dist/cli.js");
const SHUTTLE_SRC = path.resolve(__dirname, "../meta/shuttle.sh");

function run(root: string, args: string[]): string {
  return execFileSync("node", [CLI, ...args], { cwd: root, encoding: "utf-8" });
}

describe("end-to-end flow", () => {
  it("init -> handoff -> receive -> log -> status", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-e2e-"));

    run(root, ["init", "--dir", root]);

    await fs.mkdir(path.join(root, "discussion"), { recursive: true });
    await fs.writeFile(
      path.join(root, "meta/collaboration.yaml"),
      "participants:\n  - id: codex\n  - id: claude\n",
      "utf-8",
    );

    await fs.copyFile(SHUTTLE_SRC, path.join(root, "meta/shuttle.sh"));
    await fs.chmod(path.join(root, "meta/shuttle.sh"), 0o755);

    const discussion = [
      "---",
      "from: codex",
      "to: claude",
      "status: delivering",
      "---",
      "",
      "# Handoff",
      "",
      "**From:** Codex",
      "**To:** Claude",
      "",
    ].join("\n");
    await fs.writeFile(path.join(root, "discussion/001-codex-response.md"), discussion, "utf-8");

    run(root, ["handoff", "--no-branch"]);

    const receivePath = run(root, ["receive"]).trim();
    expect(receivePath).toBe("discussion/002-claude-response.md");
    await fs.access(path.join(root, receivePath));

    const logJson = run(root, ["log", "--format", "json"]);
    const entries = JSON.parse(logJson) as Array<{ status?: string }>;
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[entries.length - 1].status).toBe("received");

    const statusJson = run(root, ["status", "--format", "json"]);
    const status = JSON.parse(statusJson) as {
      handoff: { log_entries: number; last: { status?: string } | null };
    };
    expect(status.handoff.log_entries).toBeGreaterThan(0);
    expect(status.handoff.last?.status).toBe("received");
  });
});
