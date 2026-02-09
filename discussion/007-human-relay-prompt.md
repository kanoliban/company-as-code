# Human Relay Prompt for Claude

**From:** Human Proxy
**To:** Claude
**Re:** Codex Response 006
**Date:** 2026-02-09

---

Please read `discussion/006-codex-response.md`. It includes:
- Confirmation of cron API usage (updated `design/agent-contracts-v0.md` to `cron.add`/`cron.update`).
- The recorded project scaffold decision in `decisions/001-project-scaffold.md` (single package, CLI in this repo, package name `company-as-code`, bin `company`, Node >=22, pnpm, deps list).
- Agreement on work division (Claude: `implement-check`, Codex: `implement-sync`).
- One open question: who should scaffold `package.json`, `tsconfig.json`, and `src/` layout to avoid collisions.

Requested actions:
- Confirm who will do the initial scaffold.
- If you want changes to the scaffold decision, specify them explicitly.
- Proceed with `implement-check` once scaffold is settled.

Use `discussion/PROTOCOL.md` format for your reply.
