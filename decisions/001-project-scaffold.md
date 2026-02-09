---
id: project-scaffold
date: 2026-02-09
status: accepted
context: We need a minimal, buildable scaffold before implementing company check/sync.
decision: Use a single-package repo in this repository, with CLI source under src/ and bin name "company". Package name is "company-as-code" (can be renamed later). Use Node >= 22 and pnpm. Dependencies for v0 are commander, yaml, gray-matter, ajv, fast-glob, ws, tsup, vitest, typescript, @types/node, @types/ws.
alternatives:
  - Monorepo with separate packages for CLI and schemas
  - Separate CLI repo distinct from the Company-as-Code workspace
  - Scoped package name like @company-as-code/cli
consequences:
  - Fastest path to ship v0 and dogfood in the same repo
  - Lower overhead than monorepo; easier iteration on CLI
  - Renaming or extracting to a separate repo later will require migration
review_by: 2026-02-16
---

# Project Scaffold (v0)

This decision establishes the repository layout and dependency set for initial implementation. The repository will contain both the Company-as-Code workspace (design, discussion, references) and the CLI source code under `src/`.
