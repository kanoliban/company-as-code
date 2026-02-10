# FAQ and Troubleshooting

Common errors and how to fix them.

---

## "No company.yaml found"

**All commands except `init`** require a `company.yaml` in the current directory or a parent directory. This file marks the repo root.

**Fix:** Either `cd` into a Company-as-Code repo, or run `company init` to create one.

---

## Node version warning

```
WARN  Unsupported engine: wanted: {"node":">=22"}
```

The CLI targets Node 22+ for native `fs.watch` recursive support and other modern APIs. It may work on older versions but is untested.

**Fix:** Install Node 22 via nvm, fnm, or your package manager:

```bash
nvm install 22
nvm use 22
```

---

## "OPENCLAW_GATEWAY_TOKEN not set"

The `sync` and `handoff --send` commands connect to an OpenClaw gateway and require an auth token.

**Fix:**

```bash
export OPENCLAW_GATEWAY_TOKEN=your-token-here
```

If you don't have a token, you can still use offline commands: `sync --compile-only`, `handoff` (without `--send`), `simulate`.

The `doctor` command reports this as a warning, not a failure — the token is only needed for gateway operations.

---

## "fatal: not a git repository"

The `diff` command requires a git repository. The `doctor` and `handoff` commands also use git for branch detection and change tracking.

**Fix:** Initialize git in your repo:

```bash
git init && git add -A && git commit -m "Initial commit"
```

This error is a warning in `doctor` output — it won't cause the command to fail.

---

## "Refusing to overwrite existing files"

`company init` won't overwrite files that already exist.

**Fix:** Use `--force` to overwrite:

```bash
company init --force
```

---

## Check failures vs. validation errors

**`company validate`** checks structural correctness: are required fields present? Are IDs unique? Do filenames match? Think of it as schema validation.

**`company check`** enforces business rules defined in `checks/*.yaml`: is every task assigned? Do discussion files follow the protocol? Are agent contracts consistent with collaboration config?

Run `validate` first. If it passes, run `check`. The `doctor` command runs both in sequence.

---

## Agent filename/ID mismatch

```
agents/my-agent.yaml: id "myagent" does not match filename "my-agent"
```

The `id` field inside the YAML must match the filename (without extension).

**Fix:** Rename either the file or the `id` field so they match:
- File `agents/my-agent.yaml` should have `id: my-agent`.
- Or rename the file to `agents/myagent.yaml` to match `id: myagent`.

---

## Duplicate work queue IDs

```
meta/work-queue.yaml: duplicate item id "my-task"
```

Every item in `meta/work-queue.yaml` must have a unique `id`.

**Fix:** Search for duplicate IDs and rename one:

```bash
grep "id:" meta/work-queue.yaml | sort | uniq -d
```

---

## Handoff manifest validation warnings

`company simulate` may report warnings about the handoff manifest:

- **Missing `from` or `to`**: The manifest should specify sender and receiver.
- **Missing `version`**: Add a `version` field (e.g., `1`).
- **Missing `source_file`**: The manifest should reference the discussion file it was generated from.

These are warnings, not errors — the handoff will still proceed, but metadata quality suffers.

---

## "Exit handler never called" from npm

This is a known npm bug that appears when `npm login` is run in a non-interactive shell. It doesn't affect authentication — the login URL is still valid.

**Fix:** Run `npm login` from a regular terminal (not piped or inside a non-interactive script).

---

## Tests fail with Vite CJS warning

```
The CJS build of Vite's Node API is deprecated.
```

This is a warning from Vitest, not an error. Tests will still run. The warning will go away when Vitest fully migrates to ESM internals.

---

## How to run a single test file

```bash
pnpm test -- tests/check.test.ts
```

Or in watch mode:

```bash
pnpm test:watch -- tests/check.test.ts
```

---

## How to add a custom check rule

Create a YAML file in `checks/`:

```yaml
# checks/my-rule.yaml
id: my-rule
severity: warning
description: Every objective must have an owner
query:
  file: state/objectives.yaml
  path: items
  condition:
    field: owner
    operator: exists
```

Run `company check --id my-rule` to test it.

---

## How to use the CLI programmatically

The package exports the CLI entry points:

```typescript
import { buildCli, runCli } from "company-as-code";
```

Internal helpers are not exported; stability guarantees are limited to the CLI interface for now.
