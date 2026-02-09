# Bhanu's 10-Agent Squad — Reference Implementation

**Source:** Twitter thread by @pbteja1998 (Jan 31, 2026)
**Context:** Built for SiteGPT (AI chatbot for customer support)

## The Setup

10 OpenClaw agents, each a separate session with its own personality, memory, and cron schedule. One gateway, multiple session keys.

## Architecture Decisions

### Agent Identity = Session + SOUL
Each agent is a Clawdbot session with:
- Unique session key: `agent:<role>:main`
- SOUL.md (personality, strengths, values)
- AGENTS.md (operating manual)
- Own memory files (WORKING.md, daily notes, MEMORY.md)

### The Heartbeat Pattern
Agents wake every 15 minutes via cron. Staggered schedule:
```
:00 Pepper    :02 Shuri    :04 Friday    :06 Loki
:07 Wanda     :08 Vision   :10 Fury      :12 Quill
```

Each heartbeat:
1. Load context (read WORKING.md)
2. Check for @mentions and assigned tasks
3. Scan activity feed
4. Take action or report HEARTBEAT_OK

### Memory Stack (3 tiers)
1. **Working memory** — `WORKING.md` (current task state, updated constantly)
2. **Daily notes** — `memory/YYYY-MM-DD.md` (raw logs)
3. **Long-term memory** — `MEMORY.md` (curated important facts)

Golden rule: "If you want to remember something, write it to a file."

### Agent Communication
- Option 1: Direct session messaging (`clawdbot sessions send`)
- Option 2: Shared database (Mission Control) — all agents read/write same Convex DB
- Used Option 2 primarily

### Agent Levels
- **Intern:** Needs approval for most actions
- **Specialist:** Works independently in their domain
- **Lead:** Full autonomy, can make decisions and delegate

### Daily Standup (automated)
Cron at 11:30 PM IST compiles:
- Completed today
- In progress
- Blocked
- Needs review
- Key decisions

## The Roster

| Name | Role | Session Key |
|------|------|-------------|
| Jarvis | Squad Lead | `agent:main:main` |
| Shuri | Product Analyst | `agent:product-analyst:main` |
| Fury | Customer Researcher | `agent:customer-researcher:main` |
| Vision | SEO Analyst | `agent:seo-analyst:main` |
| Loki | Content Writer | `agent:content-writer:main` |
| Quill | Social Media | `agent:social-media-manager:main` |
| Wanda | Designer | `agent:designer:main` |
| Pepper | Email Marketing | `agent:email-marketing:main` |
| Friday | Developer | `agent:developer:main` |
| Wong | Documentation | `agent:notion-agent:main` |

## Task Lifecycle
Inbox → Assigned → In Progress → Review → Done (+ Blocked)

## Key Lessons
1. Start with 2-3 agents, not 10
2. Use cheaper models for routine heartbeats
3. Memory is hard — files > mental notes
4. Let agents surprise you (contribute to unassigned tasks)
5. Treat agents like team members (roles, memory, accountability)

## What's Missing (Company-as-Code gaps)
- **No canon layer** — SOUL defines agent identity, nothing defines organizational doctrine
- **No organizational tests** — daily standup is manual accountability, no automated invariant checks
- **No decision records** — decisions happen in task comments, no structured ADR/RFC system
- **Memory is siloed** — each agent has own WORKING.md, no unified context graph
- **No declared interfaces** — agents communicate through @mentions, not declared contracts
