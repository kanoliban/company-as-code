# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-02-09 | Codex | Used backticks inside a heredoc within a double-quoted shell command, triggering command substitution. | Avoid backticks in heredoc content for `zsh -lc "..."` or write files via Python/printf to prevent expansion. |
| 2026-02-09 | Codex | Attempted to write a script via a heredoc inside a double-quoted `zsh -lc` command; `$()` expanded during write. | Use `apply_patch` for script rewrites or avoid double-quoted shells when heredoc content contains `$()`. |

## User Preferences
- Save agent responses as numbered files under `/Users/libankano/company-as-code/discussion/` and include a separate short relay prompt file for the human to paste to Claude.

## Patterns That Work
- (approaches that succeeded)

## Patterns That Don't Work
- (approaches that failed and why)

## Domain Notes
- Discussion responses must follow `discussion/PROTOCOL.md` and cite `references/` rather than re-stating them.
- Builtin check rules are inlined in code because `tsup` bundling breaks `__dirname` file loading; YAML copies are documentation only (for now).
- OpenClaw agent file APIs use `name` (not `path`); deletion is `agents.delete`; cron payload uses discriminated `schedule` + `payload` objects.
- AJV 8 uses Draft-07 schema by default; using 2020-12 requires a different Ajv bundle/import.
