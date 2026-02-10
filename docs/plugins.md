# Plugins

The plugin system lets you add custom commands to the CLI without modifying the core codebase. Plugins are repo-local: they live in your `plugins/` directory and are discovered automatically.

---

## Quick start

Create a plugin:

```bash
company plugin init my-tool
```

This scaffolds `plugins/my-tool/plugin.yaml`. Edit it, then run:

```bash
company plugin run my-tool
```

List all installed plugins:

```bash
company plugin list
```

---

## Plugin manifest

Each plugin lives in `plugins/<id>/plugin.yaml`:

```yaml
id: my-tool
name: My Tool
description: Does something useful
commands:
  default:
    cmd: node
    args: ["scripts/run.js"]
    cwd: .
```

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier. Must match the folder name. |
| `commands` | object | At least one command definition (see below). |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable name. |
| `description` | string | Short description shown in `plugin list`. |
| `engine` | string | Minimum CLI version (e.g., `>=1.0.0`). Reserved for future use — not enforced yet. |

### Command definition

Each key under `commands` defines a named command:

```yaml
commands:
  default:
    cmd: node
    args: ["scripts/run.js"]
    cwd: .
  lint:
    cmd: npx
    args: ["eslint", "src/"]
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cmd` | string | yes | Executable name or relative path. |
| `args` | string[] | no | Arguments passed to the executable. |
| `cwd` | string | no | Working directory, relative to repo root. Defaults to repo root. |

The `default` command runs when no `--command` flag is specified.

---

## Running plugins

Run the default command:

```bash
company plugin run my-tool
```

Run a named command:

```bash
company plugin run my-tool --command lint
```

Pass extra arguments to the plugin:

```bash
company plugin run my-tool -- --verbose --fix
```

Arguments after `--` are appended to the plugin's `args` array.

Dry-run without executing:

```bash
company plugin run my-tool --dry-run
```

---

## Listing plugins

```bash
company plugin list
```

Shows each plugin's ID, description, and available commands. Invalid manifests are flagged inline with an error message.

JSON output:

```bash
company plugin list --format json
```

---

## Validation

Plugins are validated automatically when you run `plugin list` or `plugin run`. The following checks are performed:

- Manifest is valid YAML and parses as an object.
- `id` is present and matches the folder name.
- `commands` is a non-empty object.
- Each command has a non-empty `cmd` string.
- `args` (if present) is an array of strings.
- `cwd` (if present) is a safe relative path.

`company validate` also checks plugin manifests as part of the structural integrity sweep, so plugin errors are caught in CI alongside other validation failures.

---

## Safety constraints

Plugins execute commands via `spawn` (no shell). The following restrictions are enforced:

- **No absolute paths**: `cmd` and `cwd` must be relative paths or bare executable names (like `node`, `npx`).
- **No home directory expansion**: paths starting with `~` are rejected.
- **No directory traversal**: paths containing `../` are rejected.
- **Repo-local only**: plugins are discovered exclusively from `plugins/` in the repo root. No global or remote plugin loading.

If a plugin violates these constraints, the CLI exits with code `1` and a clear error message.

---

## Examples

### Node script plugin

```yaml
# plugins/report/plugin.yaml
id: report
name: Weekly Report
description: Generate a weekly status report
commands:
  default:
    cmd: node
    args: ["plugins/report/generate.js"]
```

```javascript
// plugins/report/generate.js
const fs = require("fs");
// ... generate report
console.log("Report generated.");
```

### Shell script plugin

```yaml
# plugins/deploy/plugin.yaml
id: deploy
name: Deploy
description: Deploy to staging
commands:
  default:
    cmd: bash
    args: ["plugins/deploy/deploy.sh"]
  rollback:
    cmd: bash
    args: ["plugins/deploy/rollback.sh"]
```

### Python plugin

```yaml
# plugins/analyze/plugin.yaml
id: analyze
name: Analyze
description: Run analysis scripts
commands:
  default:
    cmd: python3
    args: ["plugins/analyze/main.py"]
```

---

## Troubleshooting

**"Plugin not found"**: Check that `plugins/<id>/plugin.yaml` exists and `id` matches the folder name.

**"cmd must be a relative path or executable name"**: Use a bare command (`node`, `bash`, `python3`) or a relative path (`plugins/my-tool/run.sh`). Absolute paths are not allowed.

**"cwd must be a safe relative path"**: The `cwd` field cannot be absolute, start with `~`, or traverse upward with `../`.

**Plugin command exits non-zero**: The CLI forwards the plugin's exit code. Check the plugin's own error output.
