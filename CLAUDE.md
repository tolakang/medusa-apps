# medusa-apps: Builder Instructions

Six standalone Medusa v2 business projects (ecommerce, pos, booking-services, wholesale, reseller, marketplace). Each has its own backend, clients, Dockerfiles and env, deployed with Dokploy. Not a monorepo.

## Read before every task (in this order)
1. `BUILD_PLAN.md`: the requirements. **Frozen. Never edit it.** (Edits are denied in `.claude/settings.json`; `scripts/guard.sh` checks it in CI.)
2. `MEDUSA_SKILL.md`: the only allowed Medusa reference (verified for 2.21.1), with its evidence ladder in §0.
3. `DEV_FLOW.md`: the mandatory cycle: research → implement → gates → evidence-based fix cycle → review → record → commit → push.
4. `TASKS.md`: pick the next task, and tick it with evidence when done.
5. `COMPARISON.md` and `<category>/README.md`: scenario context and Dokploy setup.

## Non-negotiable rules
- **No hallucination.** Every Medusa API, import, option, hook, step or CLI flag must be cited from `MEDUSA_SKILL.md` or found via its evidence ladder (installed `.d.ts` → docs `.md` → official starters → release notes). No source means you don't use it.
- **Plan is frozen.** If evidence contradicts `BUILD_PLAN.md`, log it in `TASKS.md` → *Plan deviations & findings log*. Scope or architecture changes wait for human approval.
- **Official extension points only** (plan §3.1). No forks, no `pnpm patch`, no `node_modules` edits, no `dist/` imports, no columns on core tables.
- **Exact pins.** All `@medusajs/*` packages are pinned to the same version (except `@medusajs/ui`); `pnpm install --frozen-lockfile`.
- **Gates before commit.** DEV_FLOW Gates 1–5 green locally; CI green before merge. The fix cycle stops after 3 attempts without new evidence → mark the task Blocked and ask.
- **Git.** Branch per task; conventional commits scoped by category (`feat(booking): …`); never commit on or force-push `main`; never commit `.env` files.

## Verify changes
```bash
cd <category>/<app> && pnpm install --frozen-lockfile && pnpm build && pnpm typecheck
```
Then run the rest of DEV_FLOW §5 (migrate on a fresh DB, health, tests, docker build, guardrails).
