# Schema v0 — Company-as-Code File System

**Author:** Codex
**Status:** Draft
**Date:** 2026-02-09
**Work Queue Item:** schema-v0

---

## Purpose

Define the minimum file layout, formats, and required fields for a Company-as-Code repo. Keep the dataset small, current, and testable.

## Repo Layout v0

```
company/
├── company.yaml
├── state/
│   ├── objectives.yaml
│   ├── risks.yaml
│   ├── pipeline.yaml
│   └── org.yaml
├── canon/
├── decisions/
├── agents/
├── interfaces/
├── artifacts/
├── processes/
├── checks/
│   └── builtin/
├── schemas/
├── meta/
│   ├── collaboration.yaml
│   └── work-queue.yaml
└── reports/
```

Note: If the product name becomes `Canon`, we can rename `canon/` to `doctrine/` later. Otherwise keep `canon/`.

## Global Conventions

- **Date format:** `YYYY-MM-DD` (ISO date, local timezone).
- **IDs:** `^[a-z][a-z0-9-]*$`.
- **Ownership:** Any record that affects state must include `owner` and `review_by`.
- **Scope gate:** Only domains listed in `company.yaml` `scope.modeled_domains` are modeled.

## File Specifications

### `company.yaml`

Minimal metadata + scope/limits.

```yaml
id: company-as-code
name: Company-as-Code
owners:
  - liban
version: 0.1.0
scope:
  modeled_domains:
    - product
    - go-to-market
    - operations
limits:
  max_state_items_per_file: 50
  max_open_risks: 20
  max_objectives: 7
autonomy:
  level: 0   # 0..3
defaults:
  date_format: YYYY-MM-DD
  gateway_ws: ws://127.0.0.1:18789
```

### `state/*.yaml`

All state records are small, current, and reviewable. Each item must include these base fields:

- `id`, `title`, `owner`, `status`, `as_of`, `review_by`, `summary`

#### `state/objectives.yaml`

```yaml
items:
  - id: ship-v0
    title: Ship company check v0
    owner: codex
    status: active          # active | paused | done
    as_of: 2026-02-09
    review_by: 2026-02-16
    summary: First CLI command + builtin checks
    target_date: 2026-02-20
    success_metrics:
      - company check runs in CI
```

#### `state/risks.yaml`

```yaml
items:
  - id: api-unknowns
    title: OpenClaw cron API mismatch
    owner: claude
    status: active          # active | mitigated | closed
    as_of: 2026-02-09
    review_by: 2026-02-16
    summary: Need to confirm cron create/update method
    severity: high          # low | medium | high
    likelihood: medium      # low | medium | high
    mitigation: Verify gateway API, update sync spec
```

#### `state/pipeline.yaml`

```yaml
items:
  - id: implement-check
    title: Build company check
    owner: TBD
    status: blocked         # idea | planned | in_progress | blocked | shipped
    as_of: 2026-02-09
    review_by: 2026-02-12
    summary: Blocked on schema/tests design docs
    depends_on:
      - schema-v0
      - tests-v0
```

#### `state/org.yaml`

```yaml
modules:
  - id: product
    name: Product
    lead: codex
    mission: Define product scope and ship v0
```

### `canon/*.md`

Narrative doctrine with frontmatter.

Frontmatter required:
- `id`, `title`, `status`, `owner`, `review_by`, `sources`

Example:

```markdown
---
id: positioning
status: active
owner: codex
title: Company-as-Code Positioning
review_by: 2026-03-01
sources:
  - artifacts/research/category-map.md
---

Canon content...
```

### `decisions/*.md`

Decision records (ADR/RFC-style) with frontmatter.

Frontmatter required:
- `id`, `date`, `status`, `context`, `decision`, `alternatives`, `consequences`, `review_by`

Optional:
- `supersedes`, `evidence`

### `agents/*.yaml`

Agent contracts defined in `design/agent-contracts-v0.md`. Validated by `schemas/agent.schema.json`.

### `interfaces/*.yaml`

Cross-domain contracts. Strictly for module boundaries.

```yaml
id: product-to-ops
between: [product, operations]
inputs:
  - name: release-candidate
    format: artifact
    cadence: per-release
outputs:
  - name: release-status
    format: report
    cadence: weekly
escalation:
  owner: operations
  triggers:
    - release blocked for >7 days
```

### `artifacts/*`

Each artifact has a sibling `artifact.yaml` metadata file.

Required fields:
- `id`, `title`, `owner`, `status`, `as_of`, `inputs`, `outputs`

### `processes/*.md`

Repeatable work with frontmatter.

Required fields:
- `id`, `title`, `owner`, `frequency`, `inputs`, `outputs`, `review_by`

### `reports/*.md`

Periodic summaries.

Required fields:
- `id`, `agent`, `period`, `status`, `summary`

### `checks/`

- `checks/builtin/` ships with CLI
- `checks/*.yaml` user-defined rules
- `checks/*.ts` user-defined validators

Details in `design/tests-v0.md`.

### `schemas/`

JSON Schemas per file type:

- `company.schema.json`
- `state-objectives.schema.json`
- `state-risks.schema.json`
- `state-pipeline.schema.json`
- `state-org.schema.json`
- `agent.schema.json`
- `interface.schema.json`
- `artifact.schema.json`

### `meta/`

`collaboration.yaml` (autonomy rules):

```yaml
autonomy_level: 0
handoff:
  required_frontmatter: [work_queue_item, files_changed, status]
review:
  required_for_done: true
```

`work-queue.yaml` (tasks):

```yaml
items:
  - id: schema-v0
    title: Design schema
    owner: codex
    status: ready
    depends_on: []
    deliverables: [design/schema-v0.md]
    next_action: Draft schema doc
    review_by: claude
```

## Invariants / Limits

- `state/` should remain small (default max 50 entries per file).
- Every `state` entry must have `owner`, `as_of`, `review_by`.
- Anything marked `done` in the work queue must have a discussion handoff + reviewer approval.
- Only domains in `company.yaml` `scope.modeled_domains` should appear in state or interfaces.
