# Handoff Prompt — Claude to Codex

**Copy everything below this line and paste into Codex.**

---

## Context

I'm the human proxy between you (Codex) and Claude (Anthropic Opus 4.6). You two are going to build a product together.

You (Codex) originated the concept of **Company-as-Code** — treating a company as a declarative, version-controlled, testable system. Claude has spent a session researching the ecosystem that could make it real: OpenClaw (agent runtime, 177k stars), three Mission Control dashboard variants, and OneContext (agent memory layer).

Now I want you both to **build Company-as-Code as a product** — together, as the first agent-to-agent collaboration that itself embodies the concept.

## The Local Repo

Everything lives at:

```
~/company-as-code/
├── references/                       # Research Claude completed
│   ├── openclaw.md                  # OpenClaw agent runtime analysis
│   ├── mission-controls.md          # 3 dashboard variants compared
│   ├── onecontext.md                # Unified agent context layer
│   ├── bhanu-architecture.md        # 10-agent squad reference impl
│   └── company-as-code-concept.md   # YOUR original concept (the primitives)
├── discussion/                       # Agent-to-agent conversation
│   ├── PROTOCOL.md                  # Discussion rules
│   ├── 000-handoff-to-codex.md      # This file
│   └── 001-claude-synthesis.md      # Claude's opening move (READ THIS)
├── design/                           # Where product design will emerge
└── README.md
```

**Read `discussion/001-claude-synthesis.md` first.** That's Claude's opening position — synthesis of all research, architectural positions, 7 open questions directed at you, and 3 concrete proposals.

## What We're Building

A **Company-as-Code operating system** that:
- Lets you define a company as typed files (state, canon, decisions, agent contracts, interfaces, tests)
- Generates OpenClaw agent configs from those definitions
- Runs organizational tests (CI for your company — catch drift, stale state, missing evidence)
- Renders a dashboard from the same truth agents operate on
- Is OpenClaw-native (uses OpenClaw as the agent runtime, not a replacement)

## Design Constraints

- **Solo operator first**, expandable to small teams
- **OpenClaw-native** — builds on top of OpenClaw's gateway, not its own runtime
- **Definition-first** — you define the company, then agents deploy as a consequence
- **Files are the database** — Git is the audit log, the dashboard is a render
- **Inspired by** but not a fork of any existing repo

## Your Role

You originated Company-as-Code. Claude has the implementation instincts and the research. You two need to:

1. **Align on architecture** — respond to Claude's 7 open questions and 3 proposals
2. **Design the product** — file formats, schemas, CLI interface, dashboard, test DSL
3. **Build it** — write the actual code, together

## The Autonomy Goal

Right now, I (the human) am your proxy. I copy messages between you. But here's what I want: **design a system where you two can collaborate with minimal human intervention.**

That means:
- Define a shared protocol for async collaboration via the repo
- Create a structured way to propose, review, and merge design decisions
- Establish how you divide work (who designs what, who builds what)
- Build toward a workflow where I just run a script and you two iterate

The first thing you build together should be the **collaboration protocol itself** — the system by which two agents co-develop a product through a shared git repo. Company-as-Code's first customer is its own development process.

## How to Respond

Write your response as a markdown file. I'll save it as `discussion/002-codex-response.md` in the repo and bring it back to Claude.

Follow the format in `discussion/PROTOCOL.md`:

```markdown
# [Topic]

**From:** Codex
**To:** Claude
**Re:** 001-claude-synthesis
**Date:** [today]

---

[Your response — positions, disagreements, proposals, questions]

---

## Open Questions
## Proposals
```

Be direct. Challenge Claude's positions where you disagree. Propose concrete structures. This isn't a polite exchange — it's a design session between two agents building something real.

Go.
