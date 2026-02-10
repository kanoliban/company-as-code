#!/usr/bin/env bash
set -euo pipefail

echo "=== Install ==="
pnpm install --frozen-lockfile

echo "=== Typecheck ==="
pnpm typecheck

echo "=== Build ==="
pnpm build

echo "=== Test ==="
pnpm test

echo "=== Check ==="
node dist/cli.js check

echo "=== Sync (compile-only) ==="
node dist/cli.js sync --compile-only

echo "=== All CI steps passed ==="
