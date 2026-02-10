# CLI Command Reference

All commands require Node 22+ and must be run inside a Company-as-Code repo (a directory with `company.yaml`), unless otherwise noted.

Global install: `npm i -g company-as-code`, then use `company <command>`.
One-off: `npx company-as-code <command>`.

---

## init

Scaffold a new Company-as-Code repo.

```
company init [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--name <name>` | Company name | directory name |
| `--owner <owner>` | Primary owner | `$USER` (or `owner`) |
| `--dir <path>` | Target directory | `.` |
| `--force` | Overwrite existing files | off |
| `--no-samples` | Omit sample content | includes samples |

Does not require an existing `company.yaml` — this command creates one.

Exit codes: `0` success, `1` file conflict without `--force`.

---

## validate

Structural integrity checks on core repo files.

```
company validate [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--format <format>` | Output format (`pretty` or `json`) | `pretty` |
| `--section <section>` | Section to validate (`company`, `agents`, `plugins`, `work-queue`, `handoff`, `all`) | `all` |

Checks:
- `company.yaml` has `name` (or `id`) and `version`.
- Each `agents/*.yaml` has required fields (`id`, `name`, `mission`, `inputs`, `outputs`) and filename matches `id`.
- `meta/work-queue.yaml` has an `items` array with unique, non-empty `id` fields.
- `meta/handoff.yaml` (if present) has `version`, `source_file`, `from`, `to`.

Exit codes: `0` all valid, `1` validation errors found, `2` no repo found.

---

## check

Run declarative YAML business rules.

```
company check [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--id <checkId>` | Run a specific check by ID | all checks |
| `--severity <level>` | Filter by severity (`error`, `warning`, `info`) | all |
| `--format <format>` | Output format (`pretty` or `json`) | `pretty` |
| `--scope <glob>` | Restrict checks to files matching a glob | all files |
| `--watch` | Re-run checks on file changes | off |

Loads rules from `checks/*.yaml` and built-in checks in `src/checks/builtin/`.

Exit codes: `0` all pass, `1` failures found, `2` no repo found.

---

## view

Render a summary of repo sections.

```
company view [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--section <name>` | Section to render (`objectives`, `risks`, `pipeline`, `work-queue`) | all sections |
| `--format <format>` | Output format (`pretty` or `json`) | `pretty` |

Reads from `state/objectives.yaml`, `state/risks.yaml`, `state/pipeline.yaml`, and `meta/work-queue.yaml`.

Exit codes: `0` success, `2` no repo found.

---

## diff

Compare repo changes between two git refs.

```
company diff [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--from <ref>` | Git ref to diff from | `HEAD~1` |
| `--to <ref>` | Git ref to diff to | `HEAD` |
| `--format <format>` | Output format (`pretty` or `json`) | `pretty` |
| `--semantic` | Use semantic YAML diff for known files | off |

Without `--semantic`: lists changed files grouped by folder (state, agents, meta, etc.).

With `--semantic`: parses YAML items by `id` field and reports `added`, `removed`, `changed`, and `status_changed` (for work queue) entries.

Requires git. Exit codes: `0` success, `1` git error, `2` no repo found.

---

## normalize

Backfill missing frontmatter on discussion response files.

```
company normalize [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--dry-run` | Show changes without writing files | off |
| `--normalize-ids` | Slugify `from`/`to` fields (e.g., "Claude (Anthropic)" becomes `claude`) | off |
| `--format <format>` | Output format (`pretty` or `json`) | `pretty` |

Scans `discussion/*-response.md`. For each file missing `from`, `to`, or `status` in YAML frontmatter, extracts values from body `**From:**`/`**To:**` patterns and adds frontmatter with `status: delivering` as default.

Exit codes: `0` success, `2` no repo found.

---

## plugin

Manage repo‑local plugins discovered under `plugins/*/plugin.yaml`.

```
company plugin list
company plugin run <plugin> [--command <name>] [-- <args...>]
company plugin init <id> [options]
```

### plugin list

Lists all plugins with their available commands. Validation errors are printed to stderr and result in exit code `1`.

### plugin run

Runs a plugin command with no shell execution (direct `spawn`):
- Default command name is `default`.
- Plugin `cmd` may be a binary or relative path; absolute paths are rejected.
- `cwd` (if provided) must be a safe relative path.
- `--dry-run` prints the resolved command payload without executing.

Exit codes: `0` success, `1` plugin error or validation failure, `2` no repo found.

### plugin init

Scaffolds `plugins/<id>/plugin.yaml` with a minimal template.

| Option | Description | Default |
|--------|-------------|---------|
| `--name <name>` | Display name for the plugin | title-cased from id |
| `--description <description>` | Short description | none |
| `--force` | Overwrite existing manifest | off |

---

## sync

Compile and sync agent contracts to the OpenClaw gateway.

```
company sync [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--gateway <wsUrl>` | Override gateway WebSocket URL | from `company.yaml` |
| `--agent <id>` | Sync a single agent | all agents |
| `--dry-run` | Show diffs without writing | off |
| `--compile-only` | Compile locally without connecting to gateway | off |
| `--out-dir <dir>` | Output directory for `--compile-only` | `.compiled` |
| `--prune` | Remove agents not present in repo | off |
| `--yes` | Skip confirmation prompts | off |
| `--force` | Overwrite even if unchanged | off |

Reads `agents/*.yaml`, validates against the agent schema, compiles contracts, and pushes to the gateway (or writes to disk with `--compile-only`).

Requires `OPENCLAW_GATEWAY_TOKEN` env var for gateway sync.

Exit codes: `0` success, `1` compile/sync error, `2` no repo found.

---

## handoff

Generate a handoff manifest and optionally relay via OpenClaw.

```
company handoff [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--gateway <wsUrl>` | Override gateway WebSocket URL | from `company.yaml` |
| `--to <agentId>` | Target agent ID | from handoff manifest |
| `--session-key <key>` | Explicit OpenClaw session key | auto-generated |
| `--send` | Send relay via OpenClaw | off (dry-run) |
| `--dry-run` | Print relay prompt without sending | on |
| `--no-branch` | Skip auto-branch creation | off |

Default behavior (no `--send`): prints the relay prompt to stdout. With `--send`: delivers via OpenClaw gateway and logs to `meta/handoff-log.yaml`.

Exit codes: `0` success, `1` send error, `2` no repo found.

---

## receive

Consume a handoff manifest and prepare a response stub.

```
company receive [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--manifest <path>` | Path to handoff manifest | `meta/handoff.yaml` |
| `--format <format>` | Output format (`pretty` or `json`) | `pretty` |

Reads the manifest, creates a response stub file in `discussion/`, and logs a `received` entry to `meta/handoff-log.yaml`.

Exit codes: `0` success, `1` invalid manifest, `2` no repo found.

---

## log

Show handoff history.

```
company log [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--limit <n>` | Number of entries to show | `10` |
| `--format <format>` | Output format (`pretty` or `json`) | `pretty` |

Reads `meta/handoff-log.yaml` and displays entries in a table (pretty) or JSON array.

Exit codes: `0` success, `2` no repo found.

---

## status

Show a repo status dashboard.

```
company status [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--format <format>` | Output format (`pretty` or `json`) | `pretty` |

Displays three sections:
1. **Handoff** — last entry and total log count.
2. **Work queue** — item count grouped by status.
3. **Checks** — passed/failed/warning counts.

Exit codes: `0` success, `2` no repo found.

---

## simulate

Dry-run a handoff without side effects.

```
company simulate [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--format <format>` | Output format (`pretty` or `json`) | `pretty` |

Reads the latest discussion file, builds a manifest in memory, validates it, and writes a report to `reports/simulation.json`. No log entries are created, no stubs are written, no manifests are mutated.

Exit codes: `0` success, `1` validation issues, `2` no repo found.

---

## doctor

Full diagnostic: environment checks + validate + check + compile.

```
company doctor [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--format <format>` | Output format (`pretty` or `json`) | `pretty` |

Runs six steps in order:
1. **node** — checks Node.js version (>=22 recommended).
2. **git** — checks git is available and repo is initialized.
3. **gateway-token** — checks `OPENCLAW_GATEWAY_TOKEN` is set.
4. **validate** — runs `company validate`.
5. **check** — runs `company check`.
6. **compile** — runs `company sync --compile-only`.

Steps 1-3 produce `pass`/`warn` (informational). Steps 4-6 produce `pass`/`fail`.

Exit codes: `0` all pass, `1` any step fails, `2` no repo found.
