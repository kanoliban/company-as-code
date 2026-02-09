# Tests v0 — Organizational CI for Company-as-Code

**Author:** Claude
**Status:** Draft
**Date:** 2026-02-09
**Work Queue Item:** tests-v0

---

## Purpose

`company check` is the first shipped command. It runs organizational tests against the company definition and reports violations. Like `eslint` for your company — catches drift, missing fields, stale state, and broken contracts.

## Architecture

```
checks/
├── builtin/                    # Ship with the CLI
│   ├── decisions-required-fields.yaml
│   ├── state-staleness.yaml
│   ├── agent-contracts-complete.yaml
│   ├── canon-has-review-dates.yaml
│   └── interfaces-balanced.yaml
├── *.yaml                      # User-defined YAML rules
└── *.ts                        # User-defined TypeScript validators
```

The CLI discovers and runs all checks in order: builtins first, then user-defined YAML rules, then TS validators.

## YAML Rule Format

```yaml
id: decisions-required-fields
description: Every decision record must have context, alternatives, and consequences
severity: error                    # error | warning | info
scope: decisions/*.md              # glob pattern for target files
require_frontmatter:               # required frontmatter keys
  - context
  - decision
  - alternatives
  - consequences
  - review_by
```

```yaml
id: state-staleness
description: State entries must be refreshed within their review window
severity: error
scope: state/*.yaml
each_entry:                        # iterate over entries in the YAML file
  require_fields: [owner, as_of, review_by]
  assert:
    - field: review_by
      condition: not_past           # review_by date must not be in the past
```

```yaml
id: agent-contracts-complete
description: Every agent contract must declare mission, inputs, outputs, and boundaries
severity: error
scope: agents/*.yaml
require_fields:
  - id
  - name
  - mission
  - inputs
  - outputs
  - forbidden
  - escalation
  - heartbeat
```

```yaml
id: canon-has-review-dates
description: Canon documents must have review dates to prevent doctrine from becoming stale
severity: warning
scope: canon/*.md
require_frontmatter:
  - review_by
  - status                         # active | deprecated | superseded
```

```yaml
id: interfaces-balanced
description: Every interface must have both inputs and outputs defined
severity: error
scope: interfaces/*.yaml
require_fields:
  - id
  - between                        # [module_a, module_b]
  - inputs
  - outputs
  - escalation
```

## Rule DSL Operators

For v0, keep the operator set minimal:

| Operator | Applies To | Meaning |
|----------|-----------|---------|
| `require_fields` | YAML files | Top-level keys must exist |
| `require_frontmatter` | Markdown files | Frontmatter keys must exist |
| `each_entry` | YAML arrays/maps | Apply assertions to each item |
| `assert.condition` | Field values | `not_empty`, `not_past`, `matches:<regex>`, `one_of:<list>` |
| `assert.references` | Field values | Value must be a valid path in the repo |

**Date format (v0):** `YYYY-MM-DD` (ISO date). `not_past` compares against local date.

This covers ~80% of organizational checks. The TS escape hatch handles the rest.

## TypeScript Escape Hatch

```typescript
// checks/custom-claim-evidence.ts
import { Check, CheckResult } from '@company-as-code/checks';

const check: Check = {
  id: 'custom-claim-evidence',
  description: 'External claims in canon must link to evidence',
  severity: 'warning',

  async run(repo): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const canonFiles = await repo.glob('canon/*.md');

    for (const file of canonFiles) {
      const content = await repo.read(file);
      const claims = extractClaims(content); // user-defined extraction

      for (const claim of claims) {
        if (!claim.sourceLink) {
          results.push({
            file,
            line: claim.line,
            message: `Claim "${claim.text.slice(0, 50)}..." has no source link`,
          });
        }
      }
    }

    return results;
  }
};

export default check;
```

## CLI Interface

```bash
# Run all checks
company check

# Run specific check
company check --id decisions-required-fields

# Run only errors (skip warnings)
company check --severity error

# Output as JSON (for CI)
company check --format json

# Check a specific scope
company check --scope "agents/*.yaml"
```

## Output Format (human)

```
company check

  ✗ decisions-required-fields
    decisions/003-api-design.md: missing frontmatter: alternatives, consequences

  ✗ state-staleness
    state/risks.yaml: entry "competitor-launch" review_by is 2026-01-15 (24 days past)

  ⚠ canon-has-review-dates
    canon/positioning.md: missing frontmatter: review_by

  ✓ agent-contracts-complete
  ✓ interfaces-balanced

  3 checks passed, 2 failed, 1 warning
```

## Output Format (JSON, for CI)

```json
{
  "passed": 3,
  "failed": 2,
  "warnings": 1,
  "results": [
    {
      "id": "decisions-required-fields",
      "severity": "error",
      "status": "fail",
      "violations": [
        {
          "file": "decisions/003-api-design.md",
          "message": "missing frontmatter: alternatives, consequences"
        }
      ]
    }
  ]
}
```

## Builtin Checks (ship with v0)

| ID | Scope | What It Checks |
|----|-------|---------------|
| `decisions-required-fields` | `decisions/*.md` | Context, decision, alternatives, consequences, review_by |
| `state-staleness` | `state/*.yaml` | review_by not past, owner present, as_of present |
| `agent-contracts-complete` | `agents/*.yaml` | All required contract fields present |
| `canon-has-review-dates` | `canon/*.md` | review_by and status in frontmatter |
| `interfaces-balanced` | `interfaces/*.yaml` | Both inputs and outputs defined |
| `work-queue-integrity` | `meta/work-queue.yaml` | Done items have discussion update + approval |
| `no-orphan-artifacts` | `artifacts/*` | Every artifact has metadata (owner, as_of, status) |

**Note:** `work-queue-integrity` assumes each `discussion/NNN-*-update.md` includes frontmatter with `work_queue_item`, `files_changed`, and `status`.

## Implementation Notes

- Parse YAML with `yaml` (npm). Parse Markdown frontmatter with `gray-matter`.
- JSON Schema validation for structured files uses `ajv`.
- The CLI is a single `company` binary built with TypeScript + `tsup`.
- Checks run synchronously in sequence. No parallelism needed at this scale.
- Exit code 0 = all pass. Exit code 1 = any error-severity failure. Warnings don't fail CI.
