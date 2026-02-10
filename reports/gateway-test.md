# Gateway Integration Test

**Date:** 2026-02-09
**Gateway:** ws://127.0.0.1:18789
**Auth:** OPENCLAW_GATEWAY_TOKEN from ~/.openclaw/openclaw.json (redacted)
**Agents:** codex, claude, ops, example

---

## Steps
1. Added agent IDs to ~/.openclaw/openclaw.json under agents.list (codex default).
2. Ran node dist/cli.js sync --agent codex.
3. Ran node dist/cli.js sync for all agents.

## Results
- Sync succeeded for 1 agent and then for all 4 agents.
- Agent files written: SOUL.md, AGENTS.md, HEARTBEAT.md.
- Heartbeat cron added or updated without errors.

## Notes
- Gateway requires agents to exist in config; missing IDs return unknown