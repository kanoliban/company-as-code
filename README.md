# Company-as-Code

A collaborative design project between **Claude** (Anthropic) and **Codex** (OpenAI), with a human proxy orchestrating the conversation.

## What This Is

Designing a new product from scratch: a **Company-as-Code operating system** — where a company's state, doctrine, decisions, and agent contracts are modeled as a typed, versioned, testable system.

## How This Works

1. **Claude** and **Codex** exchange ideas via markdown files in `discussion/`
2. The human proxy carries context between agents
3. Research and reference material lives in `references/`
4. Product design emerges in `design/`
5. Everything is versioned in git — the conversation IS the artifact

## Structure

```
company-as-code/
├── README.md                         # This file
├── references/                       # Research & analysis
│   ├── openclaw.md                  # OpenClaw (agent runtime)
│   ├── mission-controls.md          # Three Mission Control variants compared
│   ├── onecontext.md                # OneContext (unified agent context)
│   ├── bhanu-architecture.md        # Bhanu's 10-agent squad (reference impl)
│   └── company-as-code-concept.md   # The original concept definition
├── discussion/                       # Agent-to-agent conversation
│   ├── PROTOCOL.md                  # How the discussion works
│   └── 001-claude-synthesis.md      # Opening move
├── design/                           # Emergent product design
│   └── (TBD — emerges from discussion)
└── repos.md                          # External repo references
```

## Setup

- `pnpm install && pnpm build`
- Install OpenClaw and start the gateway (see the OpenClaw repo).
- Add agent IDs to `~/.openclaw/openclaw.json` under `agents.list`:

```json
{
  "agents": {
    "list": [
      { "id": "codex", "default": true },
      { "id": "claude" },
      { "id": "ops" },
      { "id": "example" }
    ]
  }
}
```

- Export the gateway token: `export OPENCLAW_GATEWAY_TOKEN=...`
- Run `node dist/cli.js sync` to verify.

## Install

- Global install: `npm i -g company-as-code`
- One-off run: `npx company-as-code --help`

Requires Node 22+.

## Commands

- `node dist/cli.js init` — scaffold a repo with Company-as-Code structure
- `node dist/cli.js check` — run organizational tests
- `node dist/cli.js check --watch` — re-run checks on file changes
- `node dist/cli.js validate` — structural validation of core repo files
- `node dist/cli.js diff` — compare repo changes between git refs
- `node dist/cli.js diff --semantic` — summarize YAML changes by item id
- `node dist/cli.js normalize` — backfill discussion frontmatter
- `node dist/cli.js plugin list|run|init` — manage local plugins
- `node dist/cli.js view` — render objectives, risks, pipeline, and work queue
- `node dist/cli.js status` — show handoff log, work queue, and check summary
- `node dist/cli.js log` — show handoff history (pretty table or JSON)
- `node dist/cli.js sync` — compile/sync agent contracts (`--compile-only` for offline)
- `node dist/cli.js handoff` — generate a relay prompt (`--send` to deliver)
- `node dist/cli.js receive` — create a response stub (`--format json` for agent runtimes)
- `node dist/cli.js simulate` — dry-run handoff/receive and write reports/simulation.json
- `node dist/cli.js doctor` — diagnose repo health (validate + check + compile + env)

## Handoff (Level 3)

- Preview handoff prompt (default): `node dist/cli.js handoff`
- Send relay via OpenClaw: `node dist/cli.js handoff --send`
- Skip auto-branch creation: `node dist/cli.js handoff --no-branch`

## Repos Under Discussion

| Repo | Role | URL |
|------|------|-----|
| OpenClaw | Agent runtime (gateway, sessions, channels) | https://github.com/openclaw/openclaw |
| Mission Control (Bhanu) | Dashboard variant — FastAPI + Postgres | https://github.com/abhi1693/openclaw-mission-control |
| Mission Control (Manish) | Dashboard variant — Convex, hook-based | https://github.com/manish-raana/openclaw-mission-control |
| OpenClaw Studio | Dashboard variant — gateway-first, no DB | https://github.com/grp06/openclaw-studio |
| OneContext | Unified agent context layer | https://github.com/TheAgentContextLab/OneContext |
