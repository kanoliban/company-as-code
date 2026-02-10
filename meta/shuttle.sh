#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DISCUSSION_DIR="$ROOT_DIR/discussion"
WORK_QUEUE="$ROOT_DIR/meta/work-queue.yaml"
HANDOFF_FILE="$ROOT_DIR/meta/handoff.yaml"

CREATE_BRANCH=false
if [[ "${1:-}" == "--create-branch" ]]; then
  CREATE_BRANCH=true
  shift
fi

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

frontmatter_file="$(mktemp)"
trap 'rm -f "$frontmatter_file"' EXIT

awk '
  BEGIN { inside=0 }
  /^---[[:space:]]*$/ {
    if (inside==0) { inside=1; next }
    exit
  }
  { if (inside==1) print }
' "$latest_response" > "$frontmatter_file"

extract_scalar() {
  local key="$1"
  awk -F': *' -v k="$key" '$1==k {print $2; exit}' "$frontmatter_file"
}

extract_list() {
  local key="$1"
  awk -v k="$key" '
    $0 ~ "^" k ":" { inside=1; next }
    inside && /^[^[:space:]]/ { exit }
    inside && /^[[:space:]]*-[[:space:]]*/ {
      sub(/^[[:space:]]*-[[:space:]]*/, "")
      print
    }
  ' "$frontmatter_file"
}

from_field="$(extract_scalar "from")"
to_field="$(extract_scalar "to")"
status_field="$(extract_scalar "status")"

if [[ -z "$to_field" ]]; then
  to_field="$(grep -m1 '^\*\*To:\*\*' "$latest_response" | sed 's/.*\*\*To:\*\* *//' || true)"
fi

if [[ -z "$from_field" ]]; then
  from_field="$(grep -m1 '^\*\*From:\*\*' "$latest_response" | sed 's/.*\*\*From:\*\* *//' || true)"
fi

if [[ -z "$to_field" ]]; then
  to_field="Claude"
fi

work_queue_items=()
while IFS= read -r line; do
  [ -n "$line" ] && work_queue_items+=("$line")
done < <(extract_list "work_queue_item" || true)

files_changed_items=()
while IFS= read -r line; do
  [ -n "$line" ] && files_changed_items+=("$line")
done < <(extract_list "files_changed" || true)

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-//; s/-$//'
}

from_id=""
if [[ -n "$from_field" ]]; then
  from_id="$(slugify "$from_field")"
fi

to_id=""
if [[ -n "$to_field" ]]; then
  to_id="$(slugify "$to_field")"
fi

branch_name=""
if git -C "$ROOT_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
  from_slug="${from_id:-unknown}"
  to_slug="${to_id:-unknown}"
  branch_name="handoff/${latest_num}-${from_slug}-to-${to_slug}"
  if [[ "$CREATE_BRANCH" == "true" ]]; then
    if git -C "$ROOT_DIR" rev-parse --verify "$branch_name" >/dev/null 2>&1; then
      git -C "$ROOT_DIR" checkout "$branch_name" >/dev/null 2>&1
    else
      git -C "$ROOT_DIR" checkout -b "$branch_name" >/dev/null 2>&1
    fi
  fi
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

{
  echo "version: 1"
  echo "source_file: $rel_path"
  echo "generated_at: $(date +%F)"
  if [[ -n "$from_id" ]]; then echo "from: $from_id"; fi
  if [[ -n "$to_id" ]]; then echo "to: $to_id"; fi
  if [[ -n "$branch_name" ]]; then echo "branch: $branch_name"; fi

  if [[ ${#work_queue_items[@]} -eq 0 ]]; then
    echo "work_queue_items: []"
  else
    echo "work_queue_items:"
    for item in "${work_queue_items[@]}"; do
      echo "  - $item"
    done
  fi

  if [[ ${#files_changed_items[@]} -eq 0 ]]; then
    echo "files_changed: []"
  else
    echo "files_changed:"
    for item in "${files_changed_items[@]}"; do
      echo "  - $item"
    done
  fi

  echo "status: pending"
  echo "sent_at: null"
  echo "session_key: null"
} > "$HANDOFF_FILE"

files_for_prompt=()
if [[ ${#files_changed_items[@]} -gt 0 ]]; then
  files_for_prompt=("${files_changed_items[@]}")
elif git -C "$ROOT_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
  while IFS= read -r line; do
    [ -n "$line" ] && files_for_prompt+=("$line")
  done < <(git -C "$ROOT_DIR" status --porcelain | awk '{print $2}')
fi

work_queue_summary=""
if [[ ${#work_queue_items[@]} -gt 0 ]]; then
  work_queue_summary="${work_queue_items[*]}"
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

Status: ${status_field:-unknown}
Handoff manifest: meta/handoff.yaml
${next_line}
PROMPT_BODY

if [[ -n "$work_queue_summary" ]]; then
  echo "Work queue item(s): $work_queue_summary"
fi

if [[ -n "$branch_name" ]]; then
  echo "Suggested branch: $branch_name"
  echo "Handoff command: git checkout -b $branch_name"
fi

echo "Receive command: node dist/cli.js receive"
echo "Receive JSON: node dist/cli.js receive --format json"

if [[ ${#files_for_prompt[@]} -gt 0 ]]; then
  echo "Files changed:"
  for file in "${files_for_prompt[@]}"; do
    echo "- $file"
  done
fi

echo ""
echo "If you have updates or decisions, respond using discussion/PROTOCOL.md format."
