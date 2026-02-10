# Workflow Guide

This guide walks through the complete Company-as-Code lifecycle, from creating a repo to running autonomous agent handoffs.

---

## 1. Initialize a repo

```bash
company init --name "Acme Corp" --owner "alice"
```

This scaffolds the directory structure:

```
acme-corp/
├── company.yaml              # Root config (name, version)
├── state/
│   ├── objectives.yaml       # Strategic objectives
│   ├── risks.yaml            # Known risks
│   └── pipeline.yaml         # Delivery pipeline
├── canon/                    # Organizational doctrine
├── decisions/                # Decision records
├── agents/                   # Agent contract YAML files
├── interfaces/               # API/integration definitions
├── artifacts/                # Build outputs
├── meta/
│   ├── work-queue.yaml       # Task tracking
│   └── collaboration.yaml    # Agent collaboration config
├── checks/                   # Custom YAML check rules
└── reports/                  # Generated reports
```

Use `--no-samples` to get empty directories without example content.

---

## 2. Define agent contracts

Create YAML files in `agents/` for each agent:

```yaml
# agents/codex.yaml
id: codex
name: Codex
mission: Build and ship CLI features
inputs:
  - design docs
  - work queue items
outputs:
  - source code
  - tests
  - discussion responses
```

Required fields: `id`, `name`, `mission`, `inputs`, `outputs`. The filename must match the `id` (e.g., `codex.yaml` for `id: codex`).

---

## 3. Validate structure

```bash
company validate
```

Checks that core files are well-formed:
- `company.yaml` has required fields.
- Agent files have required fields and filenames match IDs.
- Work queue items have unique IDs.

Fix any errors before proceeding. Use `--format json` for CI integration.

---

## 4. Run business rules

```bash
company check
```

Evaluates declarative YAML rules from `checks/` against the repo. Rules can enforce conventions like:
- Every work queue item must have an owner.
- Discussion files must follow the naming protocol.
- Agent contracts must have matching collaboration entries.

Filter by severity or ID:

```bash
company check --severity error
company check --id discussion-protocol
```

Use `--watch` for continuous enforcement during development:

```bash
company check --watch
```

---

## 5. Compile agent contracts

```bash
company sync --compile-only
```

Compiles `agents/*.yaml` into OpenClaw-compatible contract bundles and writes them to `.compiled/`. This validates the agent schema and catches errors before deploying.

To deploy to a live gateway:

```bash
export OPENCLAW_GATEWAY_TOKEN=your-token
company sync
```

---

## 6. View repo state

```bash
company view
```

Renders objectives, risks, pipeline, and work queue in a readable table. Filter to a single section:

```bash
company view --section work-queue
```

For a dashboard combining handoff history, work queue summary, and check results:

```bash
company status
```

---

## 7. Compare changes

```bash
company diff
```

Shows files changed between `HEAD~1` and `HEAD`, grouped by folder. For YAML-aware comparison that tracks items by `id`:

```bash
company diff --semantic --from main --to HEAD
```

This reports added, removed, changed, and status-changed items rather than raw file diffs.

---

## 8. Hand off work

Preview what will be sent:

```bash
company handoff
```

This prints the relay prompt to stdout without sending. When ready:

```bash
company handoff --send
```

This creates a handoff manifest at `meta/handoff.yaml`, logs it to `meta/handoff-log.yaml`, optionally creates a git branch, and delivers the relay via the OpenClaw gateway.

Skip branch creation for local workflows:

```bash
company handoff --send --no-branch
```

---

## 9. Receive a handoff

```bash
company receive
```

Reads `meta/handoff.yaml`, creates a response stub in `discussion/`, and logs a `received` entry to the handoff log.

Point to a different manifest:

```bash
company receive --manifest path/to/manifest.yaml
```

---

## 10. Review history

View recent handoff entries:

```bash
company log
company log --limit 5
```

---

## 11. Simulate before sending

Test a handoff cycle without side effects:

```bash
company simulate
```

Validates the manifest and writes a report to `reports/simulation.json`. Nothing is logged, no stubs are created.

---

## 12. Run full diagnostics

```bash
company doctor
```

Checks environment (Node version, git, gateway token) and runs validate, check, and compile in sequence. Use this before releases or when something seems off.

---

## Putting it together

A typical session:

```bash
# Start of work
company doctor              # Verify environment
company view --section work-queue  # See what needs doing

# After making changes
company validate            # Structure OK?
company check               # Rules pass?
company diff --semantic     # Review changes

# Hand off to next agent
company simulate            # Dry run
company handoff --send      # Deliver

# Receiving work
company receive             # Accept handoff
company log                 # Review history
company status              # Full dashboard
```

---

## CI integration

Use the included CI script for GitHub Actions or any CI system:

```bash
bash scripts/ci.sh
```

This runs: install, typecheck, build, test, check, and compile in sequence. See `.github/workflows/company-ci.yml` for the GitHub Actions workflow.
