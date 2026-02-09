import { parse as parseYaml } from "yaml";

import type { Repo } from "../lib/repo";
import type { YamlRule } from "./yaml-rule";
import { runYamlRule } from "./yaml-rule";

export type CheckSeverity = "error" | "warning" | "info";
export type CheckStatus = "pass" | "fail";

export interface CheckViolation {
  file: string;
  message: string;
  line?: number;
}

export interface CheckResult {
  id: string;
  severity: CheckSeverity;
  status: CheckStatus;
  violations: CheckViolation[];
}

export interface CheckContext {
  repo: Repo;
  filterId?: string;
  filterSeverity?: CheckSeverity;
  filterScope?: string;
}

export interface CheckSummary {
  passed: number;
  failed: number;
  warnings: number;
  results: CheckResult[];
}

export async function runChecks(context: CheckContext): Promise<CheckSummary> {
  const rules = await discoverRules(context);
  const results: CheckResult[] = [];

  for (const rule of rules) {
    const result = await runYamlRule(context.repo, rule);
    results.push(result);
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail" && r.severity === "error").length;
  const warnings = results.filter((r) => r.status === "fail" && r.severity === "warning").length;

  return { passed, failed, warnings, results };
}

async function discoverRules(context: CheckContext): Promise<YamlRule[]> {
  const rules: YamlRule[] = [];

  const builtinRules = getBuiltinRules();
  rules.push(...builtinRules);

  const userCheckFiles = await context.repo.glob("checks/*.yaml");
  for (const file of userCheckFiles) {
    const text = await context.repo.readText(file);
    const rule = parseYaml(text) as YamlRule;
    rules.push(rule);
  }

  return filterRules(rules, context);
}

function getBuiltinRules(): YamlRule[] {
  return [
    {
      id: "decisions-required-fields",
      description: "Every decision record must have context, alternatives, and consequences",
      severity: "error",
      scope: "decisions/*.md",
      require_frontmatter: ["context", "decision", "alternatives", "consequences", "review_by"],
    },
    {
      id: "state-staleness",
      description: "State entries must be refreshed within their review window",
      severity: "error",
      scope: "state/*.yaml",
      each_entry: {
        require_fields: ["owner", "as_of", "review_by"],
        assert: [{ field: "review_by", condition: "not_past" }],
      },
    },
    {
      id: "agent-contracts-complete",
      description: "Every agent contract must declare mission, inputs, outputs, and boundaries",
      severity: "error",
      scope: "agents/*.yaml",
      require_fields: ["id", "name", "mission", "inputs", "outputs", "writes", "forbidden", "escalation", "heartbeat"],
    },
    {
      id: "canon-has-review-dates",
      description: "Canon documents must have review dates to prevent doctrine from becoming stale",
      severity: "warning",
      scope: "canon/*.md",
      require_frontmatter: ["review_by", "status"],
    },
    {
      id: "interfaces-balanced",
      description: "Every interface must have both inputs and outputs defined",
      severity: "error",
      scope: "interfaces/*.yaml",
      require_fields: ["id", "between", "inputs", "outputs", "escalation"],
    },
    {
      id: "work-queue-integrity",
      description: "Work queue must have required fields for task tracking",
      severity: "error",
      scope: "meta/work-queue.yaml",
      require_fields: ["items"],
    },
    {
      id: "no-orphan-artifacts",
      description: "Artifact metadata files must have owner and status",
      severity: "warning",
      scope: "artifacts/**/artifact.yaml",
      require_fields: ["id", "title", "owner", "status", "as_of"],
    },
  ];
}

function filterRules(rules: YamlRule[], context: CheckContext): YamlRule[] {
  let filtered = rules;

  if (context.filterId) {
    filtered = filtered.filter((r) => r.id === context.filterId);
  }

  if (context.filterSeverity) {
    const severityOrder: Record<CheckSeverity, number> = { error: 0, warning: 1, info: 2 };
    const threshold = severityOrder[context.filterSeverity];
    filtered = filtered.filter((r) => severityOrder[r.severity] <= threshold);
  }

  if (context.filterScope) {
    const prefix = context.filterScope.replace(/\*.*$/, "").replace(/\/+$/, "");
    filtered = filtered.filter((r) => {
      const ruleDir = r.scope.split("/")[0];
      return ruleDir === prefix || r.scope.startsWith(prefix + "/") || r.scope === prefix;
    });
  }

  return filtered;
}

export function formatPretty(summary: CheckSummary): string {
  const lines: string[] = ["company check", ""];

  for (const result of summary.results) {
    if (result.status === "pass") {
      lines.push(`  \u2713 ${result.id}`);
    } else {
      const icon = result.severity === "error" ? "\u2717" : "\u26a0";
      lines.push(`  ${icon} ${result.id}`);
      for (const v of result.violations) {
        lines.push(`    ${v.file}: ${v.message}`);
      }
    }
  }

  lines.push("");
  lines.push(`  ${summary.passed} checks passed, ${summary.failed} failed, ${summary.warnings} warnings`);

  return lines.join("\n");
}

export function formatJson(summary: CheckSummary): string {
  return JSON.stringify(summary, null, 2);
}
