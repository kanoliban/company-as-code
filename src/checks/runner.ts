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
  _loadErrors?: CheckResult[];
}

export interface CheckSummary {
  passed: number;
  failed: number;
  warnings: number;
  results: CheckResult[];
}

export interface CheckListEntry {
  id: string;
  severity: CheckSeverity;
  scope: string;
  source: "builtin" | "custom";
  description: string;
}

export async function listChecks(context: CheckContext): Promise<CheckListEntry[]> {
  const builtinRules = getBuiltinRules();
  const builtinIds = new Set(builtinRules.map((r) => r.id));
  const builtinMap = new Map(builtinRules.map((r) => [r.id, r]));

  const userCheckFiles = await context.repo.glob("checks/*.yaml");
  const userRules: YamlRule[] = [];

  for (const file of userCheckFiles) {
    try {
      const text = await context.repo.readText(file);
      const parsed = parseYaml(text) as Record<string, unknown>;
      const errors = validateUserRule(parsed, file);
      if (errors.length > 0) continue;
      const rule = parsed as unknown as YamlRule;
      userRules.push(rule);
      if (builtinMap.has(rule.id)) builtinMap.delete(rule.id);
    } catch {
      continue;
    }
  }

  const allRules = [...builtinMap.values(), ...userRules];
  const filtered = filterRules(allRules, context);

  return filtered.map((r) => ({
    id: r.id,
    severity: r.severity,
    scope: r.scope,
    source: builtinIds.has(r.id) && !userRules.some((u) => u.id === r.id) ? "builtin" as const : "custom" as const,
    description: r.description ?? "",
  }));
}

export async function runChecks(context: CheckContext): Promise<CheckSummary> {
  const rules = await discoverRules(context);
  const results: CheckResult[] = [];

  if (context._loadErrors) {
    results.push(...context._loadErrors);
  }

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
  const builtinRules = getBuiltinRules();
  const builtinMap = new Map(builtinRules.map((r) => [r.id, r]));

  const userCheckFiles = await context.repo.glob("checks/*.yaml");
  const userRules: YamlRule[] = [];
  const loadErrors: CheckResult[] = [];

  for (const file of userCheckFiles) {
    try {
      const text = await context.repo.readText(file);
      const parsed = parseYaml(text) as Record<string, unknown>;
      const errors = validateUserRule(parsed, file);
      if (errors.length > 0) {
        loadErrors.push({
          id: `load-error:${file}`,
          severity: "error",
          status: "fail",
          violations: errors,
        });
        continue;
      }
      const rule = parsed as unknown as YamlRule;
      userRules.push(rule);
      if (builtinMap.has(rule.id)) {
        builtinMap.delete(rule.id);
      }
    } catch (err) {
      loadErrors.push({
        id: `load-error:${file}`,
        severity: "error",
        status: "fail",
        violations: [{ file, message: `failed to load: ${err instanceof Error ? err.message : String(err)}` }],
      });
    }
  }

  context._loadErrors = loadErrors;
  const rules = [...builtinMap.values(), ...userRules];
  return filterRules(rules, context);
}

function validateUserRule(parsed: Record<string, unknown>, file: string): CheckViolation[] {
  const violations: CheckViolation[] = [];
  if (typeof parsed !== "object" || parsed === null) {
    violations.push({ file, message: "rule file must be a YAML object" });
    return violations;
  }
  const missing: string[] = [];
  if (!parsed.id || typeof parsed.id !== "string") missing.push("id");
  if (!parsed.severity || typeof parsed.severity !== "string") missing.push("severity");
  if (!parsed.scope || typeof parsed.scope !== "string") missing.push("scope");
  if (missing.length > 0) {
    violations.push({ file, message: `missing required rule fields: ${missing.join(", ")}` });
  }
  if (parsed.severity && !["error", "warning", "info"].includes(parsed.severity as string)) {
    violations.push({ file, message: `invalid severity "${parsed.severity}" (must be error|warning|info)` });
  }
  if (!parsed.require_fields && !parsed.require_frontmatter && !parsed.each_entry) {
    violations.push({ file, message: "rule must define at least one of: require_fields, require_frontmatter, each_entry" });
  }
  return violations;
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
      id: "agent-tool-profiles",
      description: "Every agent contract must declare a tool profile",
      severity: "error",
      scope: "agents/*.yaml",
      require_fields: ["tools.profile"],
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
