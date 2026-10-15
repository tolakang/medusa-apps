#!/usr/bin/env bash
# Keeps BUILD_PLAN.md frozen against Claude's shell commands (CLAUDE.md:
# "Frozen. Never edit it."). The Edit(...) deny rules in settings.json cover
# Claude's file tools and the shell file commands Claude Code recognizes
# (sed, tee, redirects), but not scripts that open files themselves, such as
# python or node (docs: permissions, "Read and Edit"). This hook covers those.
#   pre  (PreToolUse, Bash): refuse a command that names a protected file and
#        looks like a write; snapshot the files for the post check.
#   post (PostToolUse, Bash): if a protected file changed during the command
#        anyway, restore the snapshot. Only changes made by that command are
#        undone, so the owner's own edits are never touched.
# An owner-approved plan revision: the owner edits the file, or disables this
# hook for that change (/hooks), then updates .build-plan.sha256.
set -u
mode="${1:-}"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
input="$(cat)"
# Hook input is JSON on stdin (docs: hooks, "Common input fields"). jq when
# available; without it, fall back to the raw JSON text so the guard never
# silently turns off.
if command -v jq >/dev/null 2>&1; then
  session="$(printf '%s' "$input" | jq -r '.session_id // "nosession"' 2>/dev/null)"
else
  session="$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
fi
session="$(printf '%s' "${session:-nosession}" | tr -c 'A-Za-z0-9_-' '_')"
snap="${TMPDIR:-/tmp}/claude-plan-guard-${session}"
files=(BUILD_PLAN.md .build-plan.sha256)

if [ "$mode" = "pre" ]; then
  if command -v jq >/dev/null 2>&1; then
    cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null)"
  else
    cmd="$input"
  fi
  if printf '%s' "$cmd" | grep -qE 'BUILD_PLAN\.md|build-plan\.sha256'; then
    if printf '%s' "$cmd" | grep -qE '(^|[^0-9&])>|(^|[^[:alnum:]_])(tee|cp|mv|rm|ln|dd|truncate|install|rsync|patch|chmod)([^[:alnum:]_]|$)|sed[^|;&]*-i|perl[^|;&]*-[a-zA-Z]*i|open\(|write|git[[:space:]]+(checkout|restore|apply|am|stash|reset|mv|rm)'; then
      echo "Blocked: BUILD_PLAN.md is frozen (CLAUDE.md). Only the owner changes it, through an approved revision. Read-only commands (cat, grep, sed -n, diff, sha256sum) are fine." >&2
      exit 2
    fi
  fi
  mkdir -p "$snap"
  for f in "${files[@]}"; do [ -f "$root/$f" ] && cp "$root/$f" "$snap/$f"; done
  exit 0
fi

if [ "$mode" = "post" ]; then
  [ -d "$snap" ] || exit 0
  changed=()
  for f in "${files[@]}"; do
    if [ -f "$snap/$f" ] && ! cmp -s "$snap/$f" "$root/$f"; then
      cp "$snap/$f" "$root/$f"; changed+=("$f")
    fi
  done
  if [ "${#changed[@]}" -gt 0 ]; then
    echo "Reverted ${changed[*]}: BUILD_PLAN.md is frozen (CLAUDE.md) and the last command changed it. Ask the owner." >&2
    exit 2
  fi
  exit 0
fi
exit 0
