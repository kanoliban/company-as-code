# Handoff Protocol v0

**Author:** Claude
**Date:** 2026-02-09
**Status:** Draft
**Work Queue Item:** handoff-protocol

---

## Purpose

Define a structured schema for `meta/handoff.yaml` so that `company handoff` can validate the manifest before relay, and receiving agents can trust its contents.

## Current State

`meta/shuttle.sh` generates `meta/handoff.yaml` with ad-hoc fields. `company handoff` reads `to` from it but does no validation. The manifest is overwritten on every run.

## Schema

```yaml
version: 1

# Source
source_file: discussion/058-codex-response.md   # required
generated_at: "2026-02-09"                       # required, ISO date

# Participants
from: codex                                      # required, agent id
to: claude                                       # required, agent id

# Context
branch: handoff/58-codex-to-claude               # optional, auto-generated
work_queue_items:                                 # optional, list of work queue item ids
  - autonomy-level-3
  - safety-gates
files_changed:                                    # optional, list of relative paths
  - src/commands/handoff.ts
  - meta/collaboration.yaml

# Delivery
status: pending                                  # required: pending | sent | failed
sent_at: null                                    # set by company handoff --send
session_key: null                                # set by company handoff --send
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | integer | yes | Schema version. Currently `1`. |
| `source_file` | string | yes | Relative path to the discussion file that triggered this handoff. |
| `generated_at` | string (ISO date) | yes | Date the manifest was generated. |
| `from` | string | yes | Agent ID of the sender. |
| `to` | string | yes | Agent ID of the receiver. |
| `branch` | string | no | Git branch name for this handoff. |
| `work_queue_items` | string[] | no | Work queue item IDs relevant to this handoff. |
| `files_changed` | string[] | no | Relative paths of files changed. |
| `status` | enum | yes | One of: `pending`, `sent`, `failed`. |
| `sent_at` | string (ISO datetime) or null | no | Timestamp when relay was sent. |
| `session_key` | string or null | no | OpenClaw session key used for relay. |

### Validation Rules

**Structural (block generation):**
1. `version` must equal `1`
2. `source_file` must match pattern `discussion/[0-9]{3}-*-response.md`
3. `generated_at` must be a valid ISO date
4. `from` and `to` must be non-empty strings
5. `from` !== `to`
6. `status` must be one of `pending`, `sent`, `failed`

**Contextual (warn, don't block):**
7. `from` and `to` should exist in `meta/collaboration.yaml` participants
8. `source_file` should exist on disk
9. `work_queue_items` entries should reference IDs in `meta/work-queue.yaml`
10. `files_changed` entries should be valid relative paths (no `..`, no absolute)

### Lifecycle

```
shuttle.sh generates → status: pending
company handoff (no --send) → prints prompt, status stays pending
company handoff --send → relays, sets sent_at + session_key, status: sent
company handoff --send (failure) → status: failed
```

## Implementation Notes

### For shuttle.sh

Update to emit `version: 1`, `status: pending`, resolve `from` field from the discussion file's author.

### For company handoff

1. After `runShuttle`, validate manifest against structural rules (1-6).
2. On validation failure, print errors and exit with code 1.
3. On `--send` success, update `status: sent`, write `sent_at` and `session_key` back to manifest.
4. On `--send` failure, update `status: failed`.

### For company check (optional builtin rule)

Add optional builtin rule `handoff-manifest-valid` that validates `meta/handoff.yaml` if it exists. Severity: `warning` (since it's transient state).

## Migration

No migration needed. Current manifests lack `version` — validation should treat missing `version` as version 0 (legacy) and skip validation with a warning.

## Test Plan

1. Valid manifest passes all structural rules
2. Missing `version` treated as legacy (warning, not error)
3. `from === to` rejected
4. Invalid `status` value rejected
5. Invalid `source_file` pattern rejected
6. `sent_at` and `session_key` written on successful send
7. `status: failed` set on send failure
