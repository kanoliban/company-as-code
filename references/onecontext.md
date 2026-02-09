# OneContext — Unified Agent Context Layer

**Repo:** https://github.com/TheAgentContextLab/OneContext
**Stars:** 208 | **Created:** 2026-02-08 (1 day old at time of analysis)
**Stack:** Node.js CLI wrapper around Python backend
**Install:** `npm i -g onecontext-ai`

## What It Is

An "Agent Self-Managed Context layer" — gives a unified context for ALL AI agents so anyone/any agent can pick up from the same point.

## Key Features

1. **Trajectory recording** — Run agents with OneContext and it records the agent's trajectory (what it did, in what order, with what context)
2. **Context sharing** — Share agent context via link; anyone can talk to it on Slack or query it
3. **Context loading** — Load shared context into new agent sessions so anyone can continue from the same point

## Workflow

1. Create a context (named container)
2. Create sessions under that context (each with a working path)
3. Work — session summaries generated automatically
4. Share — generates a shareable link; recipients can query the context or import it
5. Resume — archived sessions can be resumed; context persists

## Capabilities

- Multiple sessions per context
- Context summaries (short + detailed)
- Shareable links
- Slack integration (ask context questions in Slack)
- Session archiving and restoration
- Import shared sessions locally and continue working

## CLI

```bash
onecontext          # Launch UI
onecontext version  # Check version
onecontext update   # Update Python package
onecontext doctor --fix-upgrade  # Repair upgrade routing
oc <command>        # Short alias
```

## Relevance to Company-as-Code

OneContext solves the **memory continuity problem**:
- OpenClaw agents have per-session memory (WORKING.md, daily notes) but it's siloed per agent
- When an agent session ends, the reasoning context is gone
- OneContext makes trajectories portable and shareable

**Gap:** OneContext is a standalone tool. No documented integration with OpenClaw's gateway or session model. The bridge between "agent sessions in OpenClaw" and "context in OneContext" would need to be built.

**Architectural question:** Should context be a separate layer (OneContext model) or should it be part of the Company-as-Code definition (files in the company repo that agents read/write)?
