#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DISCUSSION_DIR="$ROOT_DIR/discussion"
WORK_QUEUE="$ROOT_DIR/meta/work-queue.yaml"

latest_response=""
latest_num=-1

for file in "$DISCUSSION_DIR"/[0-9][0-9][0-9]-*-response.md; do
  [ -e "$file" ] || continue
  base="$(basename "$file")"
  num="${base%%-*}"
  if [[ "$num" =~ ^[0-9]+$ ]]; then
    if (( 10#$num > latest_num )); then
      latest_num=$((10#$num))
      latest_response="$file"
    fi
  fi
done

if [[ -z "$latest_response" ]]; then
  echo "No discussion/*-response.md files found."
  exit 1
fi

base="$(basename "$latest_response")"
rel_path="discussion/$base"

to_field="$(awk -F': ' '/^to:/{print $2; exit}' "$latest_response" || true)"
from_field="$(awk -F': ' '/^from:/{print $2; exit}' "$latest_response" || true)"

if [[ -z "$to_field" ]]; then
  to_field="$(grep -m1 '^\*\*To:\*\*' "$latest_response" | sed 's/.*\*\*To:\*\* *//' || true)"
fi

if [[ -z "$from_field" ]]; then
  from_field="$(grep -m1 '^\*\*From:\*\*' "$latest_response" | sed 's/.*\*\*From:\*\* *//' || true)"
fi

if [[ -z "$to_field" ]]; then
  to_field="Claude"
fi

ready_item="$(awk '
  /^[[:space:]]*- id:/ { id=$NF; title="" }
  /^[[:space:]]*title:/ { sub(/^[[:space:]]*title:[[:space:]]*"?/, ""); sub(/"$/, ""); title=$0 }
  /^[[:space:]]*status:[[:space:]]*ready/ { print id " -- " title; exit }
' "$WORK_QUEUE" || true)"

if [[ -n "$ready_item" ]]; then
  next_line="Next ready item: $ready_item"
else
  next_line="No ready items in work queue."
fi

cat <<'PROMPT_HEADER'
# Relay Prompt

PROMPT_HEADER

cat <<PROMPT_BODY
**From:** Human Proxy
**To:** ${to_field}
**Re:** ${base}
**Date:** $(date +%F)

---

Please read \`${rel_path}\`.

${next_line}

If you have updates or decisions, respond using \`discussion/PROTOCOL.md\` format.
PROMPT_BODY
