import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import type { Repo } from "../src/lib/repo";
import type { HandoffManifest } from "../src/lib/handoff";
import {
  appendHandoffLog,
  createLogEntry,
  readHandoffLog,
  validateHandoffManifest,
} from "../src/lib/handoff";

function createMockRepo(files: Record<string, string>): Repo {
  return {
    root: "/mock",
    async glob(pattern: string): Promise<string[]> {
      const regex = globToRegex(pattern);
      return Object.keys(files).filter((f) => regex.test(f)).sort();
    },
    async readText(filePath: string): Promise<string> {
      const content = files[filePath];
      if (content === undefined) throw new Error(`File not found: ${filePath}`);
      return content;
    },
    async readYaml<T>(filePath: string): Promise<T> {
      const { parse } = await import("yaml");
      const text = await this.readText(filePath);
      return parse(text) as T;
    },
    async readFrontmatter(): Promise<{ data: Record<string, unknown>; content: string }> {
      return { data: {}, content: "" };
    },
    async exists(filePath: string): Promise<boolean> {
      return filePath in files;
    },
  };
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<GLOBSTAR>>/g, ".*");
  return new RegExp(`^${escaped}$`);
}

describe("handoff manifest validation", () => {
  it("accepts a valid manifest", async () => {
    const manifest: HandoffManifest = {
      version: 1,
      source_file: "discussion/001-codex-response.md",
      generated_at: "2026-02-09",
      from: "codex",
      to: "claude",
      status: "pending",
    };

    const repo = createMockRepo({
      "meta/collaboration.yaml": "participants:\\n  - id: codex\\n  - id: claude\\n",
      "meta/work-queue.yaml": "items:\\n  - id: t1\\n",
      "discussion/001-codex-response.md": "Body",
    });

    const result = await validateHandoffManifest(manifest, repo);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("treats missing version as legacy", async () => {
    const manifest: HandoffManifest = {
      source_file: "discussion/001-codex-response.md",
      generated_at: "2026-02-09",
      from: "codex",
      to: "claude",
      status: "pending",
    };
    const repo = createMockRepo({});
    const result = await validateHandoffManifest(manifest, repo);
    expect(result.ok).toBe(true);
    expect(result.legacy).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects invalid status", async () => {
    const manifest: HandoffManifest = {
      version: 1,
      source_file: "discussion/001-codex-response.md",
      generated_at: "2026-02-09",
      from: "codex",
      to: "claude",
      status: "unknown",
    };
    const repo = createMockRepo({});
    const result = await validateHandoffManifest(manifest, repo);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("status must be one of"))).toBe(true);
  });
});

describe("handoff history log", () => {
  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "handoff-log-"));
    await fs.mkdir(path.join(dir, "meta"), { recursive: true });
    return dir;
  }

  it("creates log file on first append", async () => {
    const root = await makeTmpDir();
    const manifest: HandoffManifest = {
      version: 1,
      source_file: "discussion/001-codex-response.md",
      generated_at: "2026-02-09",
      from: "codex",
      to: "claude",
      status: "sent",
      sent_at: "2026-02-09T13:00:00Z",
      branch: "handoff/1-codex-to-claude",
    };
    await appendHandoffLog(root, createLogEntry(manifest));
    const log = await readHandoffLog(root);
    expect(log.version).toBe(1);
    expect(log.max_entries).toBe(50);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].from).toBe("codex");
    expect(log.entries[0].status).toBe("sent");
    expect(log.entries[0].sent_at).toBe("2026-02-09T13:00:00Z");
  });

  it("appends to existing log", async () => {
    const root = await makeTmpDir();
    const entry1 = createLogEntry({
      source_file: "discussion/001-codex-response.md",
      from: "codex", to: "claude", status: "sent",
      generated_at: "2026-02-09", sent_at: "2026-02-09T13:00:00Z",
    });
    const entry2 = createLogEntry({
      source_file: "discussion/002-claude-response.md",
      from: "claude", to: "codex", status: "sent",
      generated_at: "2026-02-09", sent_at: "2026-02-09T14:00:00Z",
    });
    await appendHandoffLog(root, entry1);
    await appendHandoffLog(root, entry2);
    const log = await readHandoffLog(root);
    expect(log.entries).toHaveLength(2);
    expect(log.entries[0].from).toBe("codex");
    expect(log.entries[1].from).toBe("claude");
  });

  it("trims entries to max_entries", async () => {
    const root = await makeTmpDir();
    const { stringify } = await import("yaml");
    const seedLog = {
      version: 1,
      max_entries: 3,
      entries: [
        { source_file: "discussion/001-codex-response.md", from: "codex", to: "claude", status: "sent", generated_at: "2026-02-01", sent_at: null, branch: null },
        { source_file: "discussion/002-claude-response.md", from: "claude", to: "codex", status: "sent", generated_at: "2026-02-02", sent_at: null, branch: null },
        { source_file: "discussion/003-codex-response.md", from: "codex", to: "claude", status: "sent", generated_at: "2026-02-03", sent_at: null, branch: null },
      ],
    };
    await fs.writeFile(path.join(root, "meta/handoff-log.yaml"), stringify(seedLog), "utf-8");

    await appendHandoffLog(root, createLogEntry({
      source_file: "discussion/004-claude-response.md",
      from: "claude", to: "codex", status: "sent",
      generated_at: "2026-02-04",
    }));

    const log = await readHandoffLog(root);
    expect(log.entries).toHaveLength(3);
    expect(log.entries[0].generated_at).toBe("2026-02-02");
    expect(log.entries[2].generated_at).toBe("2026-02-04");
  });

  it("reads empty log when file does not exist", async () => {
    const root = await makeTmpDir();
    const log = await readHandoffLog(root);
    expect(log.version).toBe(1);
    expect(log.entries).toHaveLength(0);
  });
});
