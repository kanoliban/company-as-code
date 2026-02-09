# Mission Control Variants — Comparative Analysis

Three independent implementations of dashboards for OpenClaw agent management.

## 1. Bhanu's Mission Control

**Repo:** https://github.com/abhi1693/openclaw-mission-control
**Stack:** Next.js + FastAPI + Postgres + Redis
**Auth:** Clerk (optional)
**Stars:** 20

### Architecture
- Separate frontend (Next.js) and backend (FastAPI)
- Full database stack (Postgres + Redis)
- Gateway integration documented but unclear depth
- Multi-tenant via org/workspace fields

### Strengths
- Traditional full-stack architecture, well-understood
- Real backend with proper data persistence

### Weaknesses
- Heavy infrastructure for a dashboard
- State duplication (agents exist in both gateway and database)
- Gateway integration surface unclear

---

## 2. Manish's Mission Control

**Repo:** https://github.com/manish-raana/openclaw-mission-control
**Stack:** React + Vite + Convex (serverless real-time DB)
**Auth:** Convex Auth
**Stars:** 130 | **License:** Apache 2.0

### Architecture
- Convex as real-time database + serverless functions
- Hook-based integration: OpenClaw gateway hook POSTs events to `POST /openclaw/event`
- Multi-tenant via `tenantId` on every table

### Schema (6 core tables)
- `agents` — name, role, status, level (LEAD/SPC/INT), sessionKey
- `tasks` — title, status (inbox/assigned/in_progress/review/done/archived), assigneeIds, openclawRunId
- `messages` — task-linked comments with attachments
- `activities` — event log (status_update, document_created, etc.)
- `documents` — deliverables with type/path metadata
- `notifications` — @mention delivery tracking

### Hook Handler (the real integration)
The `handler.ts` hook:
- Taps into OpenClaw's `agent-events` module at gateway level
- Subscribes to lifecycle, tool, and assistant event streams
- Captures: agent start/end/error, tool usage, file writes (classified by extension), source detection (Telegram/Discord/etc.)
- Filters heartbeat runs (no task creation for cron wakeups)
- Tracks pending write tool calls for document capture
- Posts structured events to Convex via HTTP

### Strengths
- Reactive (event-driven, not polling)
- Deep event capture (tool usage, document creation, thinking events)
- Real-time UI updates via Convex

### Weaknesses
- State duplication (copies agent state into Convex)
- Convex dependency (cloud service)
- No agent file editing

---

## 3. OpenClaw Studio

**Repo:** https://github.com/grp06/openclaw-studio
**Stack:** Next.js App Router (single app)
**Auth:** None (single-user)
**Stars:** 198 | **License:** MIT

### Architecture (gateway-first)
- **No database.** Gateway is the only source of truth.
- Direct WebSocket connection to gateway
- Local JSON settings file for UI preferences only
- Agent files read/written through gateway WebSocket methods

### Key Design Decisions
- Gateway-first: agents, sessions, config live in the gateway; Studio stores only UI settings
- Remote-friendly: tailnet/remote gateways are first-class
- Single-user by design (no multi-tenant)
- Feature-first organization within Next.js App Router

### Agent File Editing
Can read/write via gateway API:
- `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `MEMORY.md`
- Methods: `agents.files.get`, `agents.files.set`

### Task Control Plane (Beads)
- External CLI tool `br` (Beads) for task tracking
- Read-only status board driven by `br --json` output
- Can SSH to remote hosts to run Beads commands
- Separate concern from the dashboard itself

### Strengths
- No state duplication (gateway = truth)
- Agent brain file editing through UI
- Pluggable task control plane (Beads)
- Remote-friendly (EC2, tailnet)
- Clean architecture (well-documented ARCHITECTURE.md, explicit forbidden patterns)

### Weaknesses
- Single-user only
- No notification/threading system between agents
- Beads dependency not well-documented

---

## Summary

| Dimension | Bhanu | Manish | Studio |
|-----------|-------|--------|--------|
| Source of truth | Postgres | Convex | **Gateway** |
| State duplication | Yes | Yes | **No** |
| Agent file editing | No | No | **Yes** |
| Event integration | Unknown | **Deep (hook-based)** | Direct WS |
| Multi-tenant | Yes | Yes | No |
| Task system | In DB | In Convex | **External (Beads)** |
| Notification system | Unknown | **Yes (@mentions, subscriptions)** | No |
| Infrastructure | Heavy | Cloud (Convex) | **Minimal** |

**For Company-as-Code:** Studio's architecture (gateway-first, no DB duplication, brain file editing) is the cleanest foundation. Manish's event capture model (hook handler) is the best integration reference. Bhanu's thread is the best operational guide.
