import { describe, expect, it } from "vitest";

import type { Repo } from "../src/lib/repo";
import type { YamlRule } from "../src/checks/yaml-rule";
import { runYamlRule } from "../src/checks/yaml-rule";
import { listChecks, runChecks, formatPretty, formatJson } from "../src/checks/runner";

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
    async readFrontmatter(filePath: string): Promise<{ data: Record<string, unknown>; content: string }> {
      const matter = await import("gray-matter");
      const text = await this.readText(filePath);
      const parsed = matter.default(text);
      return { data: parsed.data as Record<string, unknown>, content: parsed.content };
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

describe("yaml-rule engine", () => {
  describe("require_fields", () => {
    it("passes when all fields present", async () => {
      const repo = createMockRepo({
        "agents/watcher.yaml": "id: watcher\nname: Watcher\nmission: watch\ninputs: []\noutputs: []\nwrites:\n  allowed: []\n  forbidden: []\nforbidden: []\nescalation: notify\nheartbeat: 15m\n",
      });
      const rule: YamlRule = {
        id: "test-fields",
        severity: "error",
        scope: "agents/*.yaml",
        require_fields: ["id", "name", "mission", "inputs", "outputs", "forbidden", "escalation", "heartbeat"],
      };
      const result = await runYamlRule(repo, rule);
      expect(result.status).toBe("pass");
      expect(result.violations).toHaveLength(0);
    });

    it("fails when fields are missing", async () => {
      const repo = createMockRepo({
        "agents/incomplete.yaml": "id: incomplete\nname: Incomplete\n",
      });
      const rule: YamlRule = {
        id: "test-fields",
        severity: "error",
        scope: "agents/*.yaml",
        require_fields: ["id", "name", "mission", "inputs"],
      };
      const result = await runYamlRule(repo, rule);
      expect(result.status).toBe("fail");
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain("mission");
      expect(result.violations[0].message).toContain("inputs");
    });

    it("supports nested field paths", async () => {
      const repo = createMockRepo({
        "agents/nested.yaml": "id: nested\nname: Nested\nmission: ok\ninputs: []\noutputs: []\n",
      });
      const rule: YamlRule = {
        id: "test-nested",
        severity: "error",
        scope: "agents/*.yaml",
        require_fields: ["tools.profile"],
      };
      const result = await runYamlRule(repo, rule);
      expect(result.status).toBe("fail");
      expect(result.violations[0].message).toContain("tools.profile");
    });
  });

  describe("require_frontmatter", () => {
    it("passes when all frontmatter keys present", async () => {
      const repo = createMockRepo({
        "decisions/001.md": "---\ncontext: foo\ndecision: bar\nalternatives: [a]\nconsequences: [b]\nreview_by: 2026-12-01\n---\nBody\n",
      });
      const rule: YamlRule = {
        id: "test-fm",
        severity: "error",
        scope: "decisions/*.md",
        require_frontmatter: ["context", "decision", "alternatives", "consequences", "review_by"],
      };
      const result = await runYamlRule(repo, rule);
      expect(result.status).toBe("pass");
    });

    it("fails when frontmatter keys missing", async () => {
      const repo = createMockRepo({
        "decisions/002.md": "---\ncontext: foo\n---\nBody\n",
      });
      const rule: YamlRule = {
        id: "test-fm",
        severity: "error",
        scope: "decisions/*.md",
        require_frontmatter: ["context", "decision", "alternatives"],
      };
      const result = await runYamlRule(repo, rule);
      expect(result.status).toBe("fail");
      expect(result.violations[0].message).toContain("decision");
      expect(result.violations[0].message).toContain("alternatives");
    });
  });

  describe("each_entry", () => {
    it("passes when entries have required fields", async () => {
      const repo = createMockRepo({
        "state/risks.yaml": "items:\n  - id: r1\n    owner: alice\n    as_of: 2026-02-01\n    review_by: 2030-01-01\n",
      });
      const rule: YamlRule = {
        id: "test-entries",
        severity: "error",
        scope: "state/*.yaml",
        each_entry: {
          require_fields: ["owner", "as_of", "review_by"],
        },
      };
      const result = await runYamlRule(repo, rule);
      expect(result.status).toBe("pass");
    });

    it("fails when entry fields missing", async () => {
      const repo = createMockRepo({
        "state/risks.yaml": "items:\n  - id: r1\n    owner: alice\n",
      });
      const rule: YamlRule = {
        id: "test-entries",
        severity: "error",
        scope: "state/*.yaml",
        each_entry: {
          require_fields: ["owner", "as_of", "review_by"],
        },
      };
      const result = await runYamlRule(repo, rule);
      expect(result.status).toBe("fail");
      expect(result.violations[0].message).toContain("as_of");
      expect(result.violations[0].message).toContain("review_by");
    });

    it("detects past review_by dates with not_past assertion", async () => {
      const repo = createMockRepo({
        "state/risks.yaml": "items:\n  - id: r1\n    owner: alice\n    as_of: 2024-01-01\n    review_by: 2024-01-15\n",
      });
      const rule: YamlRule = {
        id: "test-staleness",
        severity: "error",
        scope: "state/*.yaml",
        each_entry: {
          require_fields: ["owner", "as_of", "review_by"],
          assert: [{ field: "review_by", condition: "not_past" }],
        },
      };
      const result = await runYamlRule(repo, rule);
      expect(result.status).toBe("fail");
      expect(result.violations.some((v) => v.message.includes("not_past"))).toBe(true);
    });

    it("passes future review_by dates", async () => {
      const repo = createMockRepo({
        "state/risks.yaml": "items:\n  - id: r1\n    owner: alice\n    as_of: 2026-01-01\n    review_by: 2030-12-31\n",
      });
      const rule: YamlRule = {
        id: "test-staleness",
        severity: "error",
        scope: "state/*.yaml",
        each_entry: {
          require_fields: ["owner", "as_of", "review_by"],
          assert: [{ field: "review_by", condition: "not_past" }],
        },
      };
      const result = await runYamlRule(repo, rule);
      expect(result.status).toBe("pass");
    });
  });

  describe("no matching files", () => {
    it("passes when scope matches nothing", async () => {
      const repo = createMockRepo({});
      const rule: YamlRule = {
        id: "test-empty",
        severity: "error",
        scope: "agents/*.yaml",
        require_fields: ["id"],
      };
      const result = await runYamlRule(repo, rule);
      expect(result.status).toBe("pass");
      expect(result.violations).toHaveLength(0);
    });
  });
});

describe("runner", () => {
  describe("runChecks", () => {
    it("runs all builtin rules and returns summary", async () => {
      const repo = createMockRepo({});
      const summary = await runChecks({ repo });
      expect(summary.passed).toBe(8);
      expect(summary.failed).toBe(0);
      expect(summary.warnings).toBe(0);
      expect(summary.results).toHaveLength(8);
    });

    it("filters by id", async () => {
      const repo = createMockRepo({});
      const summary = await runChecks({ repo, filterId: "work-queue-integrity" });
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0].id).toBe("work-queue-integrity");
    });

    it("filters by severity threshold", async () => {
      const repo = createMockRepo({});
      const summary = await runChecks({ repo, filterSeverity: "error" });
      const ids = summary.results.map((r) => r.id);
      expect(ids).not.toContain("canon-has-review-dates");
      expect(ids).not.toContain("no-orphan-artifacts");
      expect(summary.results.length).toBeGreaterThan(0);
    });

    it("counts failures correctly", async () => {
      const repo = createMockRepo({
        "meta/work-queue.yaml": "version: 1\n",
      });
      const summary = await runChecks({ repo, filterId: "work-queue-integrity" });
      expect(summary.failed).toBe(1);
      expect(summary.passed).toBe(0);
      expect(summary.results[0].status).toBe("fail");
    });

    it("filters by scope", async () => {
      const repo = createMockRepo({});
      const summary = await runChecks({ repo, filterScope: "state" });
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0].id).toBe("state-staleness");
    });

    it("counts warnings separately from failures", async () => {
      const repo = createMockRepo({
        "canon/positioning.md": "---\ntitle: Positioning\n---\nContent\n",
      });
      const summary = await runChecks({ repo, filterId: "canon-has-review-dates" });
      expect(summary.warnings).toBe(1);
      expect(summary.failed).toBe(0);
    });
  });

  describe("custom checks", () => {
    it("loads and runs a user-defined rule from checks/", async () => {
      const repo = createMockRepo({
        "checks/custom-meta.yaml": [
          "id: custom-meta",
          "severity: warning",
          "scope: state/*.yaml",
          "require_fields: [id, title]",
        ].join("\n"),
        "state/things.yaml": "id: thing1\ntitle: A thing\n",
      });
      const summary = await runChecks({ repo, filterId: "custom-meta" });
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0].id).toBe("custom-meta");
      expect(summary.results[0].status).toBe("pass");
    });

    it("custom rule overrides builtin with same id", async () => {
      const repo = createMockRepo({
        "checks/work-queue-integrity.yaml": [
          "id: work-queue-integrity",
          "severity: warning",
          "scope: meta/work-queue.yaml",
          "require_fields: [items, version]",
        ].join("\n"),
        "meta/work-queue.yaml": "items:\n  - id: t1\n",
      });
      const summary = await runChecks({ repo, filterId: "work-queue-integrity" });
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0].severity).toBe("warning");
      expect(summary.results[0].status).toBe("fail");
      expect(summary.results[0].violations[0].message).toContain("version");
    });

    it("reports malformed rule file without crashing", async () => {
      const repo = createMockRepo({
        "checks/broken.yaml": "this is not valid yaml: [",
      });
      const summary = await runChecks({ repo });
      const loadError = summary.results.find((r) => r.id.startsWith("load-error:"));
      expect(loadError).toBeDefined();
      expect(loadError!.status).toBe("fail");
      expect(loadError!.severity).toBe("error");
    });

    it("rejects rule missing required fields", async () => {
      const repo = createMockRepo({
        "checks/no-scope.yaml": "id: no-scope\nseverity: error\n",
      });
      const summary = await runChecks({ repo });
      const loadError = summary.results.find((r) => r.id === "load-error:checks/no-scope.yaml");
      expect(loadError).toBeDefined();
      expect(loadError!.violations[0].message).toContain("scope");
    });

    it("rejects rule with no check type defined", async () => {
      const repo = createMockRepo({
        "checks/empty-rule.yaml": "id: empty-rule\nseverity: error\nscope: state/*.yaml\n",
      });
      const summary = await runChecks({ repo });
      const loadError = summary.results.find((r) => r.id === "load-error:checks/empty-rule.yaml");
      expect(loadError).toBeDefined();
      expect(loadError!.violations.some((v) => v.message.includes("require_fields"))).toBe(true);
    });

    it("rejects rule with invalid severity", async () => {
      const repo = createMockRepo({
        "checks/bad-sev.yaml": "id: bad-sev\nseverity: critical\nscope: state/*.yaml\nrequire_fields: [id]\n",
      });
      const summary = await runChecks({ repo });
      const loadError = summary.results.find((r) => r.id === "load-error:checks/bad-sev.yaml");
      expect(loadError).toBeDefined();
      expect(loadError!.violations.some((v) => v.message.includes("critical"))).toBe(true);
    });

    it("runs custom each_entry rule", async () => {
      const repo = createMockRepo({
        "checks/entry-check.yaml": [
          "id: entry-check",
          "severity: error",
          "scope: state/pipeline.yaml",
          "each_entry:",
          "  require_fields: [id, owner, status]",
        ].join("\n"),
        "state/pipeline.yaml": "items:\n  - id: p1\n    owner: alice\n",
      });
      const summary = await runChecks({ repo, filterId: "entry-check" });
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0].status).toBe("fail");
      expect(summary.results[0].violations[0].message).toContain("status");
    });
  });

  describe("listChecks", () => {
    it("lists all builtin checks with source=builtin", async () => {
      const repo = createMockRepo({});
      const entries = await listChecks({ repo });
      expect(entries.length).toBe(8);
      expect(entries.every((e) => e.source === "builtin")).toBe(true);
      expect(entries.every((e) => e.id && e.severity && e.scope)).toBe(true);
    });

    it("includes custom checks with source=custom", async () => {
      const repo = createMockRepo({
        "checks/my-rule.yaml": [
          "id: my-rule",
          "description: Custom rule",
          "severity: warning",
          "scope: state/*.yaml",
          "require_fields: [id]",
        ].join("\n"),
      });
      const entries = await listChecks({ repo });
      const custom = entries.find((e) => e.id === "my-rule");
      expect(custom).toBeDefined();
      expect(custom!.source).toBe("custom");
      expect(custom!.description).toBe("Custom rule");
    });

    it("marks overridden builtins as custom", async () => {
      const repo = createMockRepo({
        "checks/work-queue-integrity.yaml": [
          "id: work-queue-integrity",
          "severity: warning",
          "scope: meta/work-queue.yaml",
          "require_fields: [items]",
        ].join("\n"),
      });
      const entries = await listChecks({ repo });
      const wq = entries.find((e) => e.id === "work-queue-integrity");
      expect(wq).toBeDefined();
      expect(wq!.source).toBe("custom");
      expect(wq!.severity).toBe("warning");
    });
  });

  describe("formatPretty", () => {
    it("shows checkmarks for passes", () => {
      const output = formatPretty({
        passed: 1,
        failed: 0,
        warnings: 0,
        results: [{ id: "test-ok", severity: "error", status: "pass", violations: [] }],
      });
      expect(output).toContain("\u2713 test-ok");
    });

    it("shows X for errors", () => {
      const output = formatPretty({
        passed: 0,
        failed: 1,
        warnings: 0,
        results: [{
          id: "test-fail",
          severity: "error",
          status: "fail",
          violations: [{ file: "a.yaml", message: "missing field x" }],
        }],
      });
      expect(output).toContain("\u2717 test-fail");
      expect(output).toContain("a.yaml: missing field x");
    });

    it("shows warning icon for warnings", () => {
      const output = formatPretty({
        passed: 0,
        failed: 0,
        warnings: 1,
        results: [{
          id: "test-warn",
          severity: "warning",
          status: "fail",
          violations: [{ file: "b.md", message: "missing review_by" }],
        }],
      });
      expect(output).toContain("\u26a0 test-warn");
    });
  });

  describe("formatJson", () => {
    it("returns valid JSON", () => {
      const summary = { passed: 1, failed: 0, warnings: 0, results: [] };
      const json = formatJson(summary);
      expect(JSON.parse(json)).toEqual(summary);
    });
  });
});
