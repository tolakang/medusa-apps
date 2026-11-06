#!/usr/bin/env bash
# Tests the plan lock (.claude/hooks/protect-build-plan.sh) against a
# throwaway project, so the real files are never touched: locked, unlocked by
# the owner's switch file, locked again, and without jq. Run by guard.sh.
#
#   scripts/test-plan-lock.sh [path/to/protect-build-plan.sh]
set -u
HOOK="${1:-$(cd "$(dirname "$0")/.." && pwd)/.claude/hooks/protect-build-plan.sh}"
T="$(mktemp -d)"
mkdir -p "$T/.claude/hooks"
printf 'plan v1\n' > "$T/BUILD_PLAN.md"
printf 'sum v1\n' > "$T/.build-plan.sha256"
printf '{}\n' > "$T/.claude/settings.json"
cp "$HOOK" "$T/.claude/hooks/protect-build-plan.sh"
export CLAUDE_PROJECT_DIR="$T" TMPDIR="$T/tmp"
mkdir -p "$TMPDIR"
pass=0; fail=0
check() { # name expected-exit actual-exit
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "ok    $1"; else fail=$((fail+1)); echo "FAIL  $1 (want $2, got $3)"; fi
}
run() { # mode json -> exit code
  printf '%s' "$2" | bash "$HOOK" "$1" >/dev/null 2>&1; echo $?
}
bashj() { printf '{"session_id":"s1","tool_input":{"command":%s}}' "$(printf '%s' "$1" | python3 -I -c 'import json,sys;print(json.dumps(sys.stdin.read()))')"; }
editj() { printf '{"session_id":"s1","tool_input":{"file_path":"%s"}}' "$1"; }

echo "== locked"
check "edit plan blocked"            2 "$(run edit "$(editj "$T/BUILD_PLAN.md")")"
check "edit plan relative blocked"   2 "$(run edit "$(editj "BUILD_PLAN.md")")"
check "edit checksum blocked"        2 "$(run edit "$(editj "$T/.build-plan.sha256")")"
check "edit hook blocked"            2 "$(run edit "$(editj "$T/.claude/hooks/protect-build-plan.sh")")"
check "edit settings blocked"        2 "$(run edit "$(editj "$T/.claude/settings.json")")"
check "edit other file allowed"      0 "$(run edit "$(editj "$T/TASKS.md")")"
check "edit switch blocked"          2 "$(run edit "$(editj "$T/.claude/plan-unlocked")")"
check "bash read plan allowed"       0 "$(run pre "$(bashj "cat BUILD_PLAN.md")")"
check "bash write plan blocked"      2 "$(run pre "$(bashj "echo x > BUILD_PLAN.md")")"
check "bash touch switch blocked"    2 "$(run pre "$(bashj "touch .claude/plan-unlocked")")"
check "bash other cmd allowed"       0 "$(run pre "$(bashj "ls")")"
# A command that changes the plan without naming it gets reverted.
run pre "$(bashj "python3 x.py")" >/dev/null
printf 'plan hacked\n' > "$T/BUILD_PLAN.md"
check "sneaky change reverted (exit)" 2 "$(run post "$(bashj "python3 x.py")")"
check "sneaky change reverted (file)" "plan v1" "$(cat "$T/BUILD_PLAN.md")"
# A command that creates the switch without naming it gets undone.
run pre "$(bashj "python3 y.py")" >/dev/null
: > "$T/.claude/plan-unlocked"
check "sneaky unlock undone (exit)"  2 "$(run post "$(bashj "python3 y.py")")"
check "sneaky unlock undone (file)"  "absent" "$([ -e "$T/.claude/plan-unlocked" ] && echo present || echo absent)"

echo "== unlocked (owner ran touch)"
: > "$T/.claude/plan-unlocked"
check "edit plan allowed"            0 "$(run edit "$(editj "$T/BUILD_PLAN.md")")"
check "edit checksum allowed"        0 "$(run edit "$(editj "$T/.build-plan.sha256")")"
check "edit switch still blocked"    2 "$(run edit "$(editj "$T/.claude/plan-unlocked")")"
check "bash write plan allowed"      0 "$(run pre "$(bashj "echo plan v2 > BUILD_PLAN.md")")"
printf 'plan v2\n' > "$T/BUILD_PLAN.md"
check "change kept (exit)"           0 "$(run post "$(bashj "echo plan v2 > BUILD_PLAN.md")")"
check "change kept (file)"           "plan v2" "$(cat "$T/BUILD_PLAN.md")"
check "bash rm switch blocked"       2 "$(run pre "$(bashj "rm .claude/plan-unlocked")")"
run pre "$(bashj "python3 z.py")" >/dev/null
rm -f "$T/.claude/plan-unlocked"
check "sneaky lock undone (exit)"    2 "$(run post "$(bashj "python3 z.py")")"
check "sneaky lock undone (file)"    "present" "$([ -e "$T/.claude/plan-unlocked" ] && echo present || echo absent)"

echo "== locked again (owner ran rm)"
rm -f "$T/.claude/plan-unlocked"
check "edit plan blocked again"      2 "$(run edit "$(editj "$T/BUILD_PLAN.md")")"

echo "== git worktree (Claude works in a worktree; project dir is the main checkout)"
G="$T/repo"; mkdir -p "$G/.claude"
printf 'main v1\n' > "$G/BUILD_PLAN.md"; printf 'sum v1\n' > "$G/.build-plan.sha256"
( cd "$G" && git init -q && git -c user.email=t@t -c user.name=t add -A && git -c user.email=t@t -c user.name=t commit -qm init && git worktree add -q "$T/wt" 2>/dev/null )
W="$T/wt"
wtj() { printf '{"session_id":"s2","cwd":"%s","tool_input":{"file_path":"%s"}}' "$W" "$1"; }
wtb() { printf '{"session_id":"s2","cwd":"%s","tool_input":{"command":"%s"}}' "$W" "$1"; }
runp() { printf '%s' "$2" | CLAUDE_PROJECT_DIR="$G" bash "$HOOK" "$1" >/dev/null 2>&1; echo $?; }
check "worktree: edit plan blocked"         2 "$(runp edit "$(wtj "$W/BUILD_PLAN.md")")"
check "worktree: edit main plan blocked"    2 "$(runp edit "$(wtj "$G/BUILD_PLAN.md")")"
check "worktree: relative edit blocked"     2 "$(runp edit "$(wtj "BUILD_PLAN.md")")"
mkdir -p "$W/.claude"; : > "$W/.claude/plan-unlocked"
check "worktree unlocked: edit allowed"     0 "$(runp edit "$(wtj "$W/BUILD_PLAN.md")")"
check "worktree unlocked: main still locked" 2 "$(runp edit "$(wtj "$G/BUILD_PLAN.md")")"
check "worktree unlocked: shell write ok"   0 "$(runp pre "$(wtb "echo v2 > BUILD_PLAN.md")")"
printf 'main hacked\n' > "$G/BUILD_PLAN.md"
check "worktree: main change reverted"      2 "$(runp post "$(wtb "echo v2 > BUILD_PLAN.md")")"
check "worktree: main file restored"        "main v1" "$(cat "$G/BUILD_PLAN.md")"
rm -f "$W/.claude/plan-unlocked"

echo "== without jq"
NOJQ="$T/nojq"; mkdir -p "$NOJQ"
for b in bash cat sed grep head tr mkdir cp cmp rm dirname basename printf; do p="$(command -v $b)"; [ -n "$p" ] && ln -sf "$p" "$NOJQ/$b"; done
runnojq() { printf '%s' "$2" | PATH="$NOJQ" bash "$HOOK" "$1" >/dev/null 2>&1; echo $?; }
check "no jq: edit plan blocked"     2 "$(runnojq edit "$(editj "$T/BUILD_PLAN.md")")"
check "no jq: edit other allowed"    0 "$(runnojq edit "$(editj "$T/TASKS.md")")"
check "no jq: bash write blocked"    2 "$(runnojq pre "$(bashj "echo x > BUILD_PLAN.md")")"

rm -rf "$T"
echo "---- $pass passed, $fail failed"
[ "$fail" = 0 ]
