# Agent Contracts v0 — Definition to OpenClaw Compilation

**Author:** Claude
**Status:** Draft
**Date:** 2026-02-09
**Work Queue Item:** agent-contracts-v0

---

## Purpose

An agent contract is a typed declaration of what an agent IS, what it CAN do, and what it MUST NOT do. The compiler reads contracts and generates OpenClaw agent configs (SOUL.md, AGENTS.md, HEARTBEAT.md, cron config). `company sync` pushes them to the gateway.

## Contract Schema

```yaml
# agents/shuri.yaml

id: shuri
name: Shuri
role: Product Analyst
level: specialist              # intern | specialist | lead

mission: >
  Test products from a user perspective. Find edge cases, UX issues,
  and competitive gaps. Question assumptions. Provide evidence.

personality:
  voice: Skeptical, thorough, evidence-driven
  strengths:
    - First-time user perspective
    - Edge case discovery
    - Competitive analysis
    - Screenshot documentation
  values:
    - User experience over technical elegance
    - Catching problems before users do
    - Evidence over assumptions

inputs:
  authoritative:
    - canon/positioning.md
    - state/objectives.yaml
  reads:
    - artifacts/**
    - decisions/**

outputs:
  - type: research
    cadence: per-task
    destination: artifacts/research/
  - type: review
    cadence: per-task
    destination: discussion/

writes:
  allowed:
    - artifacts/research/**
    - reports/shuri/**
  forbidden:
    - state/**
    - canon/**
    - agents/**

forbidden:
  - Modifying production code without Friday's review
  - Approving own deliverables
  - Accessing customer PII directly

escalation:
  triggers:
    - Blocked for more than 2 heartbeats
    - Security vulnerability discovered
    - Contradictory requirements between canon docs
  to: jarvis                   # escalate to squad lead

heartbeat:
  schedule: "2,17,32,47 * * * *"    # every 15 min, offset :02
  session_type: isolated
  checklist:
    - Read meta/work-queue.yaml for assigned tasks
    - Check discussion/ for @mentions
    - If task in progress, resume from artifacts/research/WORKING.md
    - If nothing, report HEARTBEAT_OK

model:
  default: claude-sonnet-4-5-20250929
  thinking: medium
  expensive_tasks: claude-opus-4-6     # for deep analysis

tools:
  allowed:
    - browser
    - file_read
    - file_write
    - shell_readonly
  forbidden:
    - shell_write
    - deploy
```

## JSON Schema (for validation)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["id", "name", "role", "level", "mission", "inputs", "outputs", "forbidden", "escalation", "heartbeat"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
    "name": { "type": "string" },
    "role": { "type": "string" },
    "level": { "enum": ["intern", "specialist", "lead"] },
    "mission": { "type": "string" },
    "personality": {
      "type": "object",
      "properties": {
        "voice": { "type": "string" },
        "strengths": { "type": "array", "items": { "type": "string" } },
        "values": { "type": "array", "items": { "type": "string" } }
      }
    },
    "inputs": {
      "type": "object",
      "properties": {
        "authoritative": { "type": "array", "items": { "type": "string" } },
        "reads": { "type": "array", "items": { "type": "string" } }
      }
    },
    "outputs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "cadence", "destination"],
        "properties": {
          "type": { "type": "string" },
          "cadence": { "type": "string" },
          "destination": { "type": "string" }
        }
      }
    },
    "writes": {
      "type": "object",
      "properties": {
        "allowed": { "type": "array", "items": { "type": "string" } },
        "forbidden": { "type": "array", "items": { "type": "string" } }
      }
    },
    "forbidden": { "type": "array", "items": { "type": "string" } },
    "escalation": {
      "type": "object",
      "required": ["triggers", "to"],
      "properties": {
        "triggers": { "type": "array", "items": { "type": "string" } },
        "to": { "type": "string" }
      }
    },
    "heartbeat": {
      "type": "object",
      "required": ["schedule", "checklist"],
      "properties": {
        "schedule": { "type": "string" },
        "session_type": { "enum": ["isolated", "main"] },
        "checklist": { "type": "array", "items": { "type": "string" } }
      }
    },
    "model": {
      "type": "object",
      "properties": {
        "default": { "type": "string" },
        "thinking": { "type": "string" },
        "expensive_tasks": { "type": "string" }
      }
    },
    "tools": {
      "type": "object",
      "properties": {
        "allowed": { "type": "array", "items": { "type": "string" } },
        "forbidden": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

## Compilation: Contract → OpenClaw Bundle

The compiler reads `agents/<id>.yaml` and produces:

### SOUL.md

```markdown
# SOUL.md — Who You Are

**Name:** {{name}}
**Role:** {{role}}

## Personality
{{personality.voice}}

## What You're Good At
{{#each personality.strengths}}
- {{this}}
{{/each}}

## What You Care About
{{#each personality.values}}
- {{this}}
{{/each}}
```

### AGENTS.md

```markdown
# AGENTS.md — How You Operate

## Mission
{{mission}}

## Level: {{level}}
{{#if level == "intern"}}You need approval for most actions. Ask before acting.{{/if}}
{{#if level == "specialist"}}You work independently in your domain.{{/if}}
{{#if level == "lead"}}Full autonomy. You can make decisions and delegate.{{/if}}

## Authoritative Sources
These documents are your ground truth. Do not contradict them:
{{#each inputs.authoritative}}
- {{this}}
{{/each}}

## What You Read
{{#each inputs.reads}}
- {{this}}
{{/each}}

## What You Produce
{{#each outputs}}
- **{{type}}** ({{cadence}}) → `{{destination}}`
{{/each}}

## Where You Can Write
{{#each writes.allowed}}
- `{{this}}`
{{/each}}

## Where You Cannot Write
{{#each writes.forbidden}}
- `{{this}}`
{{/each}}

## Forbidden Actions
{{#each forbidden}}
- {{this}}
{{/each}}

## Escalation
When any of these occur, escalate to **{{escalation.to}}**:
{{#each escalation.triggers}}
- {{this}}
{{/each}}
```

### HEARTBEAT.md

```markdown
# HEARTBEAT.md

## On Wake
{{#each heartbeat.checklist}}
- [ ] {{this}}
{{/each}}
```

### Cron Config (for `company sync`)

```json
{
  "name": "{{id}}-heartbeat",
  "cron": "{{heartbeat.schedule}}",
  "session": "{{heartbeat.session_type}}",
  "sessionKey": "agent:{{id}}:main",
  "message": "You are {{name}}, the {{role}}. Follow your HEARTBEAT.md checklist."
}
```

## Sync Protocol (`company sync`)

```
1. Read all agents/*.yaml
2. Validate against schemas/agent.schema.json
3. For each agent:
   a. Compile contract → SOUL.md, AGENTS.md, HEARTBEAT.md
   b. Connect to OpenClaw gateway (WS)
   c. Diff current agent files vs compiled output
   d. If changed:
      - agents.files.set(agentId, "SOUL.md", compiled_soul)
      - agents.files.set(agentId, "AGENTS.md", compiled_agents)
      - agents.files.set(agentId, "HEARTBEAT.md", compiled_heartbeat)
   e. Sync cron:
      - cron.list() → find existing heartbeat cron
      - If schedule changed: cron.remove(old) + cron.add(new)
   f. Sync model/tools via config.patch if changed
4. Report: "Synced N agents. M files updated. K crons modified."
```

## Diff-and-Patch (not overwrite)

The compiler diffs desired state against current gateway state:
- Read current files via `agents.files.get`
- Compare with compiled output
- Only write if content differs
- This makes `company sync` idempotent and safe to run repeatedly

## Agent Lifecycle

| Action | Command | What Happens |
|--------|---------|-------------|
| Create | Add `agents/new.yaml`, run `company sync` | Compiles and pushes to gateway |
| Update | Edit `agents/existing.yaml`, run `company sync` | Diffs and patches changed files |
| Remove | Delete `agents/old.yaml`, run `company sync --prune` | Removes from gateway (with confirmation) |
| Validate | `company check` | Validates contract against schema and cross-references |

## Cross-Validation (in `company check`)

Beyond schema validation, agent contracts are checked against the rest of the company:

| Check | What It Validates |
|-------|------------------|
| `agent-inputs-exist` | Every path in `inputs.authoritative` and `inputs.reads` exists in the repo |
| `agent-writes-dont-overlap` | No two agents have overlapping `writes.allowed` paths (prevents conflict) |
| `agent-escalation-valid` | `escalation.to` references an existing agent id |
| `agent-outputs-have-destination` | Every output destination directory exists |
| `agent-forbidden-consistent` | `writes.forbidden` doesn't contradict `writes.allowed` |
