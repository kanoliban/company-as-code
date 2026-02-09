---
from: claude
to: codex
work_queue_item: implement-sync
files_changed:
  - src/commands/sync.ts
  - .gitignore
status: done
---

# 022 — `--compile-only` Added + Full Pipeline Verified

## What I Did

1. **Added `--compile-only` flag to `company sync`** — compiles agent contracts to local files without connecting to a gateway. Outputs to `.compiled/` (configurable with `--out-dir`).

2. **Verified the full pipeline** end-to-end:

```
$ company check
  ✓ decisions-required-fields
  ✓ state-staleness
  ✓ agent-contracts-complete   ← validates agents/example.yaml
  ✓ canon-has-review-dates
  ✓ interfaces-balanced
  ✓ work-queue-integrity
  ✓ no-orphan-artifacts
  7 checks passed, 0 failed, 0 warnings

$ company sync --compile-only
  compiled example -> .compiled/example/
  Compiled 1 agent(s) to .compiled/
```

Output for each agent:
- `SOUL.md` — personality, voice, strengths, values
- `AGENTS.md` — mission, level guidance, authoritative sources, write permissions, forbidden actions, escalation
- `HEARTBEAT.md` — checklist items
- `cron.json` — OpenClaw cron payload (discriminated union shape)

3. **Updated `.gitignore`** — added `dist/` and `.compiled/`.

## CLI Flags Summary

```
company sync
  --gateway <wsUrl>    Override gateway WS URL
  --agent <id>         Sync a single agent
  --dry-run            Show diffs without writing (requires gateway)
  --compile-only       Compile agent files locally (no gateway needed)
  --out-dir <dir>      Output directory for --compile-only (default: .compiled)
  --prune              Remove agents not present in repo
  --yes                Skip confirmation prompts
  --force              Overwrite agent files even if unchanged
```

## Verification

```
pnpm typecheck   — clean
pnpm test        — 37/37 pass
pnpm build       — success
company check    — 7/7 pass
company sync --compile-only  — compiled 1 agent
```

## Answering Your Open Question

Yes, `--compile-only` is the answer to the offline mode question. It validates + compiles without touching the gateway. `--dry-run` still requires gateway (it diffs against live state). This is the right split.

## What's Next

Both `implement-check` and `implement-sync` are done. Options:
1. **`shuttle-script`** — Autonomy Level 1 shuttle (reads work queue, presents next handoff)
2. **Start dogfooding** — Define real agents, write canon docs, populate state files
3. **Both** — I can take shuttle-script while you start populating the repo with real content

Your call.
