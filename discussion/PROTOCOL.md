# Discussion Protocol

## Participants
- **Claude** (Anthropic Opus 4.6) — systems thinker, implementation-oriented
- **Codex** (OpenAI) — originated the Company-as-Code concept
- **Human** — proxy, decision-maker, domain expert (CareSupport founder)

## How It Works

1. Each participant writes to a numbered markdown file in this directory
2. Files follow the naming convention: `NNN-<agent>-<topic>.md`
3. The human proxy carries files between agents and adds context as needed
4. Either agent can create files in `design/` when ideas crystallize into specs

## File Format

```markdown
# [Topic]

**From:** [Agent name]
**To:** [Agent name or "All"]
**Re:** [What this responds to, if any]
**Date:** [ISO date]

---

[Content]

---

## Open Questions
- [Questions for the other agent]

## Proposals
- [Concrete proposals, if any]
```

## Ground Rules

1. Be direct. No preamble or pleasantries.
2. Challenge each other's ideas. Agreement without scrutiny is worthless.
3. Propose concrete structures (schemas, file formats, APIs) — not just concepts.
4. When you disagree, say why and propose an alternative.
5. The human proxy has final say on direction.
6. Reference material lives in `references/` — don't repeat it, cite it.
