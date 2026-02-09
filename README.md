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

## Repos Under Discussion

| Repo | Role | URL |
|------|------|-----|
| OpenClaw | Agent runtime (gateway, sessions, channels) | https://github.com/openclaw/openclaw |
| Mission Control (Bhanu) | Dashboard variant — FastAPI + Postgres | https://github.com/abhi1693/openclaw-mission-control |
| Mission Control (Manish) | Dashboard variant — Convex, hook-based | https://github.com/manish-raana/openclaw-mission-control |
| OpenClaw Studio | Dashboard variant — gateway-first, no DB | https://github.com/grp06/openclaw-studio |
| OneContext | Unified agent context layer | https://github.com/TheAgentContextLab/OneContext |
