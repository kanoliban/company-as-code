import type { Repo } from "../lib/repo";
import type { CheckResult, CheckSeverity, CheckViolation } from "./runner";

export interface YamlRuleAssert {
  field: string;
  condition: string;
}

export interface YamlRule {
  id: string;
  description?: string;
  severity: CheckSeverity;
  scope: string;
  require_fields?: string[];
  require_frontmatter?: string[];
  each_entry?: {
    require_fields?: string[];
    assert?: YamlRuleAssert[];
  };
}

function evaluateCondition(value: unknown, condition: string): boolean {
  if (condition === "not_empty") {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  if (condition === "not_past") {
    if (typeof value !== "string") return false;
    const dateValue = new Date(value);
    if (isNaN(dateValue.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dateValue >= today;
  }

  if (condition.startsWith("matches:")) {
    const pattern = condition.slice("matches:".length);
    if (typeof value !== "string") return false;
    return new RegExp(pattern).test(value);
  }

  if (condition.startsWith("one_of:")) {
    const options = condition.slice("one_of:".length).split(",").map((s) => s.trim());
    return options.includes(String(value));
  }

  return true;
}

export async function runYamlRule(repo: Repo, rule: YamlRule): Promise<CheckResult> {
  const violations: CheckViolation[] = [];
  const files = await repo.glob(rule.scope);

  for (const file of files) {
    if (rule.require_frontmatter) {
      await checkFrontmatter(repo, file, rule.require_frontmatter, violations);
    }

    if (rule.require_fields) {
      await checkTopLevelFields(repo, file, rule.require_fields, violations);
    }

    if (rule.each_entry) {
      await checkEachEntry(repo, file, rule.each_entry, violations);
    }
  }

  return {
    id: rule.id,
    severity: rule.severity,
    status: violations.length === 0 ? "pass" : "fail",
    violations,
  };
}

async function checkFrontmatter(
  repo: Repo,
  file: string,
  requiredKeys: string[],
  violations: CheckViolation[],
): Promise<void> {
  try {
    const { data } = await repo.readFrontmatter(file);
    const missing = requiredKeys.filter((key) => !(key in data) || data[key] === null || data[key] === undefined);
    if (missing.length > 0) {
      violations.push({
        file,
        message: `missing frontmatter: ${missing.join(", ")}`,
      });
    }
  } catch (err) {
    violations.push({
      file,
      message: `failed to parse frontmatter: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function checkTopLevelFields(
  repo: Repo,
  file: string,
  requiredKeys: string[],
  violations: CheckViolation[],
): Promise<void> {
  try {
    const data = await repo.readYaml<Record<string, unknown>>(file);
    if (typeof data !== "object" || data === null) {
      violations.push({ file, message: "file is not a YAML object" });
      return;
    }
    const missing = requiredKeys.filter((key) => !(key in data));
    if (missing.length > 0) {
      violations.push({
        file,
        message: `missing fields: ${missing.join(", ")}`,
      });
    }
  } catch (err) {
    violations.push({
      file,
      message: `failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function checkEachEntry(
  repo: Repo,
  file: string,
  entrySpec: NonNullable<YamlRule["each_entry"]>,
  violations: CheckViolation[],
): Promise<void> {
  try {
    const data = await repo.readYaml<Record<string, unknown>>(file);
    if (typeof data !== "object" || data === null) {
      violations.push({ file, message: "file is not a YAML object" });
      return;
    }

    const items = (data as Record<string, unknown>).items;
    const entries: unknown[] = Array.isArray(items) ? items : [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry as Record<string, unknown>;
      const entryId = (record.id as string) || `[${i}]`;

      if (entrySpec.require_fields) {
        const missing = entrySpec.require_fields.filter((key) => !(key in record));
        if (missing.length > 0) {
          violations.push({
            file,
            message: `entry "${entryId}": missing fields: ${missing.join(", ")}`,
          });
        }
      }

      if (entrySpec.assert) {
        for (const assertion of entrySpec.assert) {
          const value = record[assertion.field];
          if (!evaluateCondition(value, assertion.condition)) {
            violations.push({
              file,
              message: `entry "${entryId}": field "${assertion.field}" failed condition "${assertion.condition}" (value: ${JSON.stringify(value)})`,
            });
          }
        }
      }
    }
  } catch (err) {
    violations.push({
      file,
      message: `failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
