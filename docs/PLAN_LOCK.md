# Plan lock: how to unlock and lock `BUILD_PLAN.md`

`BUILD_PLAN.md` is frozen. Claude can read it but can't change it, unless you unlock it. Only you can unlock it, from your own terminal.

Run these from the root of the folder Claude works in (the main checkout, or the worktree Claude is using).

## Unlock (Claude may edit the plan)

```bash
touch .claude/plan-unlocked
```

Claude can now edit `BUILD_PLAN.md` and its checksum `.build-plan.sha256`.

## Lock again (the default)

```bash
rm .claude/plan-unlocked
```

No file = locked.

## Check which state you're in

```bash
ls .claude/plan-unlocked
```

"No such file or directory" means locked.

## Good to know

- **Claude can never create or delete the switch file.** Only you can. Nothing Claude reads (a page, a file, a tool's output) can unlock the plan.
- **Each folder has its own switch.** Unlocking a worktree doesn't unlock the main checkout, and the reverse.
- **The switch never goes to GitHub.** It's listed in `.gitignore`.
- **While locked**, Claude also can't change the lock itself: `.claude/hooks/protect-build-plan.sh` and `.claude/settings.json`.
- **After a plan edit**, the checksum must match, or CI fails (`scripts/guard.sh`):
  ```bash
  shasum -a 256 BUILD_PLAN.md > .build-plan.sha256
  ```
- **Lock again when you're done.** A revision is the only reason to unlock.
- **Test the lock** at any time (it uses a throwaway copy, never your real files):
  ```bash
  bash scripts/test-plan-lock.sh
  ```

Details: `CLAUDE.md` (read-first list, item 1) and `TASKS.md` finding F-054.
