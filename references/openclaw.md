# OpenClaw — Agent Runtime

**Repo:** https://github.com/openclaw/openclaw
**Stars:** 177k | **License:** MIT | **Language:** TypeScript | **Runtime:** Node >= 22

## What It Is

A personal AI assistant you self-host. Runs as a persistent daemon, connects to messaging channels, provides tool access to AI models. The product is the assistant — the gateway is the control plane.

## Architecture

- **Gateway:** WebSocket control plane. Manages sessions, channels, tools, events, cron. Runs 24/7.
- **Sessions:** Independent persistent conversations. Each has its own history (JSONL on disk), model config, and tool access. Session keys like `agent:main:main` uniquely identify each agent session.
- **Channels:** WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage (BlueBubbles), Microsoft Teams, Matrix, Zalo, WebChat.
- **Cron:** Built-in scheduler. Agents wake on schedule, do work, terminate. This is how heartbeats work.
- **Agent Files:** Per-agent workspace with identity files:
  - `SOUL.md` — Who the agent is (personality, strengths, values)
  - `AGENTS.md` — Operating manual (how to operate)
  - `HEARTBEAT.md` — Wake-up checklist
  - `MEMORY.md` — Long-term curated memory
  - `WORKING.md` — Current task state
  - Daily notes at `memory/YYYY-MM-DD.md`

## Key Concepts

- **Session keys:** `agent:<agentId>:<sessionType>` — identity + isolation
- **Isolated sessions:** One-shot cron-triggered sessions that terminate after work
- **Main sessions:** Long-running interactive sessions (e.g., Telegram chat)
- **Agent events module:** Internal event stream (`lifecycle`, `tool`, `assistant` streams) — the integration surface for dashboards
- **DM pairing:** Security model — unknown senders get pairing codes, must be approved

## Integration Surface

- **WebSocket API:** `ws://127.0.0.1:18789` — full gateway control
- **Methods:** `agents.list`, `agents.files.get`, `agents.files.set`, `config.get`, `config.patch`, `sessions.reset`, `sessions.patch`, `cron.list`, `cron.run`, `cron.remove`, `chat.abort`
- **Event streams:** `onAgentEvent` — lifecycle, tool usage, assistant messages
- **Hooks:** Gateway hooks can intercept events and POST to external systems

## Model Support

Any model. Recommends Anthropic Pro/Max + Opus 4.6 for long-context and prompt-injection resistance.
