#!/usr/bin/env bash
# Keeps BUILD_PLAN.md frozen against Claude (CLAUDE.md: "Frozen. Never edit
# it."), with an on/off switch that only the owner can flip.
#
#   Locked (default):  no switch file. Claude can't change BUILD_PLAN.md,
#                      .build-plan.sha256, this hook or .claude/settings.json,
#                      by file tool or by shell.
#   Unlocked:          the owner runs, in their own terminal, at the root of
#                      the checkout Claude works in:  touch .claude/plan-unlocked
#   Lock again:        rm .claude/plan-unlocked
#
# Claude can never create, change or delete the switch file itself, so text in
# a page, file or tool output can't get the plan unlocked. The switch is
# git-ignored (local to each checkout or worktree). CI still fails until
# .build-plan.sha256 matches (scripts/guard.sh), so an unlocked edit can't
# merge by accident.
#
# Which checkout: the git root of the edited file (file tools) or of the
# command's folder (shell), plus $CLAUDE_PROJECT_DIR's, so a worktree is
# guarded like the main checkout. Each root has its own switch.
#
#   edit (PreToolUse, Edit|Write|MultiEdit|NotebookEdit): refuse a file tool on
#        a switch file always, and on a protected file of a locked root.
#   pre  (PreToolUse, Bash): refuse a command that names the switch file, or
#        names a protected file and looks like a write while a root is
#        locked; snapshot the files for the post check.
#   post (PostToolUse, Bash): undo what the command changed anyway: a changed
#        protected file of a locked root (restored from the snapshot), and a
#        switch file appearing or disappearing (always). Only changes made by
#        that command are undone, so the owner's own edits are never touched.
set -u
mode="${1:-}"
input="$(cat)"
# The plan, its checksum, and the two files that make up this lock (else
# the lock could be switched off by editing them while locked).
files=(BUILD_PLAN.md .build-plan.sha256 .claude/hooks/protect-build-plan.sh .claude/settings.json)
SWITCH=.claude/plan-unlocked

# Hook input is JSON on stdin (docs: hooks, "Common input fields"). jq when
# available; without it, a plain-text match, so the guard never silently
# turns off.
field() { # jq path, key name for the fallback
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$input" | jq -r "$1 // \"\"" 2>/dev/null
  else
    printf '%s' "$input" | grep -oE "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -n 1 | sed 's/.*:[[:space:]]*"//; s/"$//'
  fi
}
block() { echo "$1" >&2; exit 2; }
real() { (cd "$1" 2>/dev/null && pwd -P) || printf '%s' "$1"; }
gitroot() { local r; r="$(git -C "$1" rev-parse --show-toplevel 2>/dev/null)" && real "$r" || real "$1"; }

LOCKED_MSG="Blocked: BUILD_PLAN.md is frozen (CLAUDE.md). Only the owner changes it, through an approved revision. The owner unlocks it for Claude with 'touch .claude/plan-unlocked' in their own terminal. Read-only commands (cat, grep, sed -n, diff, shasum) are fine."
SWITCH_MSG="Blocked: .claude/plan-unlocked is the owner's switch for editing BUILD_PLAN.md. Only the owner creates or removes it, in their own terminal."

session="$(field '.session_id' session_id)"
session="$(printf '%s' "${session:-nosession}" | tr -c 'A-Za-z0-9_-' '_')"
snap="${TMPDIR:-/tmp}/claude-plan-guard-${session}"
cwd="$(field '.cwd' cwd)"
[ -n "$cwd" ] && [ -d "$cwd" ] || cwd="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# The roots to guard: from a folder (the file's or the command's) and the
# project dir, without duplicates.
roots_from() {
  local a b
  a="$(gitroot "$1")"
  b="$(gitroot "${CLAUDE_PROJECT_DIR:-$1}")"
  printf '%s\n' "$a"
  [ "$b" != "$a" ] && printf '%s\n' "$b"
}
locked() { [ ! -e "$1/$SWITCH" ]; }

if [ "$mode" = "edit" ]; then
  path="$(field '.tool_input.file_path' file_path)"
  [ -n "$path" ] || path="$(field '.tool_input.notebook_path' notebook_path)"
  [ -n "$path" ] || exit 0
  case "$path" in /*) ;; *) path="$cwd/$path" ;; esac
  dir="$(real "$(dirname "$path")")"
  full="$dir/$(basename "$path")"
  while IFS= read -r root; do
    [ "$full" = "$root/$SWITCH" ] && block "$SWITCH_MSG"
    for f in "${files[@]}"; do
      if [ "$full" = "$root/$f" ] && locked "$root"; then block "$LOCKED_MSG"; fi
    done
  done < <(roots_from "$dir")
  exit 0
fi

if [ "$mode" = "pre" ]; then
  cmd="$(field '.tool_input.command' command)"
  [ -n "$cmd" ] || cmd="$input"
  if printf '%s' "$cmd" | grep -qE 'plan-unlocked'; then
    block "$SWITCH_MSG"
  fi
  rm -rf "$snap"; mkdir -p "$snap"
  any_locked=0; i=0
  while IFS= read -r root; do
    i=$((i+1)); d="$snap/$i"; mkdir -p "$d"
    printf '%s' "$root" > "$d/.root"
    # The command's own checkout decides the up-front block; any other root
    # is still restored by the post check if it is locked.
    if locked "$root"; then [ "$i" = 1 ] && any_locked=1; else : > "$d/.switch-on"; fi
    for f in "${files[@]}"; do
      if [ -f "$root/$f" ]; then mkdir -p "$d/$(dirname "$f")"; cp "$root/$f" "$d/$f"; fi
    done
  done < <(roots_from "$cwd")
  if [ "$any_locked" = 1 ] && printf '%s' "$cmd" | grep -qE 'BUILD_PLAN\.md|build-plan\.sha256|protect-build-plan\.sh|settings\.json'; then
    if printf '%s' "$cmd" | grep -qE '(^|[^0-9&])>|(^|[^[:alnum:]_])(tee|cp|mv|rm|ln|dd|truncate|install|rsync|patch|chmod|touch)([^[:alnum:]_]|$)|sed[^|;&]*-i|perl[^|;&]*-[a-zA-Z]*i|open\(|write|git[[:space:]]+(checkout|restore|apply|am|stash|reset|mv|rm)'; then
      rm -rf "$snap"
      block "$LOCKED_MSG"
    fi
  fi
  exit 0
fi

if [ "$mode" = "post" ]; then
  [ -d "$snap" ] || exit 0
  msgs=()
  for d in "$snap"/*/; do
    [ -f "$d/.root" ] || continue
    root="$(cat "$d/.root")"
    # The switch may only change by the owner's hand, never during a command.
    if [ -f "$d/.switch-on" ] && locked "$root"; then
      mkdir -p "$root/.claude"; : > "$root/$SWITCH"; msgs+=("restored $SWITCH")
    elif [ ! -f "$d/.switch-on" ] && ! locked "$root"; then
      rm -f "$root/$SWITCH"; msgs+=("removed $SWITCH")
    fi
    if locked "$root"; then
      for f in "${files[@]}"; do
        if [ -f "$d/$f" ] && ! cmp -s "$d/$f" "$root/$f"; then
          cp "$d/$f" "$root/$f"; msgs+=("reverted $f")
        fi
      done
    fi
  done
  rm -rf "$snap"
  if [ "${#msgs[@]}" -gt 0 ]; then
    echo "Undone (${msgs[*]}): BUILD_PLAN.md is frozen (CLAUDE.md) and only the owner flips its switch. Ask the owner." >&2
    exit 2
  fi
  exit 0
fi
exit 0
