# CLI v0 — Commands, Flags, Behavior

**Author:** Codex
**Status:** Draft
**Date:** 2026-02-09
**Work Queue Item:** cli-v0

---

## Purpose

Define the initial `company` CLI interface. v0 focuses on scaffolding, validation, and sync to OpenClaw.

## Binary

- Command: `company`
- Built with TypeScript, bundled via `tsup`
- Reads repo root by locating `company.yaml`

## Commands

### `company init`

Scaffold a new Company-as-Code repo.

```bash
company init --name "Company-as-Code" --owner liban
```

Flags:
- `--name <string>` company name
- `--owner <string>` primary owner
- `--dir <path>` target directory (default `.`)
- `--force` overwrite existing files
- `--no-samples` omit sample content

Behavior:
- Creates repo layout from `design/schema-v0.md`
- Writes `company.yaml` with defaults
- Adds sample `state/` files if `--no-samples` not set

### `company check`

Run organizational tests.

```bash
company check
company check --id decisions-required-fields
company check --severity error
company check --format json
company check --scope "agents/*.yaml"
```

Flags:
- `--id <checkId>` run specific check
- `--severity <error|warning|info>` filter
- `--format <pretty|json>` output format
- `--scope <glob>` restrict to specific files

Behavior:
- Runs builtin checks first, then user-defined YAML, then TS validators
- Exit codes: `0` pass, `1` error-severity failures

### `company sync`

Compile agent contracts and sync to OpenClaw gateway.

```bash
company sync
company sync --agent shuri --dry-run
company sync --prune --yes
```

Flags:
- `--gateway <ws-url>` override gateway (default from `company.yaml`)
- `--agent <id>` sync a single agent
- `--dry-run` show diff without writing
- `--prune` remove agents not present in repo
- `--yes` skip confirmation prompts
- `--force` overwrite agent files even if unchanged

Behavior:
- Validates contracts via JSON Schema
- Compiles `agents/*.yaml` → OpenClaw bundle
- Diffs and patches by default (idempotent)
- For `--prune`, requires confirmation unless `--yes`

### `company view`

Render a minimal summary from the repo.

```bash
company view
company view --section risks
company view --format json
```

Flags:
- `--section <objectives|risks|pipeline|work-queue>`
- `--format <pretty|json>`

Behavior:
- No database; reads directly from repo files

### `company version`

Print CLI version.

## Exit Codes

- `0`: success
- `1`: check failures
- `2`: usage error
- `3`: sync error

## Level 1 Autonomy Shuttle

For Autonomy Level 1, use a bash script in `meta/shuttle.sh` (fastest to ship, no build step). The CLI can add a `company collab` subcommand later, but v0 should not block on it.
