# Company-as-Code — The Concept

**Origin:** Conceptualized by Codex (OpenAI)

## One Sentence

A declarative, version-controlled representation of company state + operating rules, with automated rendering and checks, so humans and agents can run the organization predictably.

## The Key Move

Software teams replaced "tribal knowledge + dashboards + Slack" with Infrastructure-as-Code:
- Single source of truth
- Reviewable diffs
- Reproducible environments
- Automation and policy checks

Company-as-Code applies the same control-plane thinking to: strategy, product definition, brand voice, planning, decision logs, roles, execution state, evidence, and metrics.

## Why It's Powerful

Companies fail like code fails:
- **Drift** — plan and reality diverge
- **Inconsistent interfaces** — different people describe the product differently
- **Unreviewed changes** — decisions in meetings with no durable record
- **Missing dependency tracking** — teams ship incompatible assumptions
- **Lack of tests** — nobody checks whether key constraints still hold
- **Single points of failure** — one person's memory is the system

## Core Primitives

### 1. State (what is true right now)
Current objectives, active bets/constraints, stakeholders/pipeline, risks, deliverables, owners.
Like `terraform.tfstate` but for the organization. Must be small and current.

### 2. Canon (what we believe is true in general)
Positioning, definitions, principles, "we will not do X", category boundaries, source quality rules.
Like library code — stable, rarely changing.

### 3. Decisions (what we commit to)
Structured decision records (ADRs/RFCs): context, decision, alternatives, consequences, review date, evidence links.
The event log for irreversible choices.

### 4. Artifacts (what we ship)
Product specs, brand guidelines, stakeholder packets, research memos, decks, prototypes.
Must have metadata: status, as-of date, owner, upstream dependencies.

### 5. Processes (how work happens repeatedly)
Checklists, runbooks, templates, rubrics.
These are "functions" that produce artifacts and update state.

### 6. Interfaces (how parts communicate)
Department-as-module contracts: inputs, outputs, reporting format, escalation rules, definitions of done.
Enables agents to operate without constant human translation.

## The Meta Layer

Not just doing work, but improving the system that produces the work:
- Iterate on the planning process
- Version the role definitions
- Measure drift and reduce it
- Run retros that change the system, not just the backlog

## Two Panes From One Dataset

One dataset (shared state) renders as:
- Executive pane (low cognitive load, focus)
- Operator/agent pane (rigor, checks, dependencies, evidence trail)

This is a human/agent interface design problem.

## Agents in Company-as-Code

Each agent role card specifies:
- Mission
- Inputs (authoritative docs)
- Outputs (weekly deliverables)
- Where it writes (which state fields/folders it updates)
- Forbidden actions (safety boundaries)
- Escalation triggers

Agents "report" by: updating shared state, producing artifacts, linking evidence.

## Organizational Tests

Examples:
- Every decision record has context/alternatives/consequences
- Every external claim links to evidence
- Every date-dependent assertion flagged if not refreshed in N days
- Every department has a weekly deliverable
- No deliverable ships without owner and as-of date

Can literally run as CI checks on PRs.

## Failure Modes

- **Over-modeling** — schema heavier than the company (fix: keep dataset tiny)
- **Bureaucracy cosplay** — lots of process, no output (fix: every process must produce a meaningful artifact)
- **Goodhart traps** — optimizing for wrong metrics (fix: treat metrics as hypotheses)
- **Stale canon** — doctrine becomes shrine (fix: review dates, reversible decisions)

## Minimal Blueprint

```
Company/
├── META/               # How the system evolves
├── STATE/              # The dataset + renderer
├── DEPARTMENTS/<Dept>/ # Charter, rubrics, outputs
├── AGENTS/             # Role cards
├── DECISIONS/          # ADRs/RFCs
├── REPORTS/            # Weekly reports
├── EVIDENCE/           # Evidence artifacts with claim mapping
```

The separation matters: truth vs state vs decisions vs artifacts vs processes.
