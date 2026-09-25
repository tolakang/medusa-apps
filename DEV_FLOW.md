# Development Flow: Build → Verify → Test → Fix Cycle → Commit → Push

> The builder must follow this flow for **every** task in `TASKS.md`: a feature, module, plugin, workflow, route, client screen or config change.
> **Inputs the builder reads first, every time:** `CLAUDE.md` → `BUILD_PLAN.md` (frozen) → `MEDUSA_SKILL.md` → this file → the task in `TASKS.md`.
> **Core rule:** every decision and every fix must rest on **evidence** (§6). Never guess.

---

## 1. Roles

One person or agent may play every role, but must do each stage **in order** and must not skip one.

| Role | Owns | Stage |
|---|---|---|
| **Builder** | Implementation | 2–4 |
| **QA** | Verification and tests | 5–6 |
| **Reviewer** | Plan and skill conformity, guardrails | 7 |
| **Release** | Commit, push, CI, deploy | 9–10 |

---

## 2. Stage 0: Pick the task

1. Take the **first unchecked task** of the current phase in `TASKS.md`. Phases follow `BUILD_PLAN.md` §7 order rules.
2. Open the plan section the task cites. The plan text is the **requirement**; its acceptance criteria are the **definition of success**.
3. Create a branch: `feat/<category>-<task-id>-<slug>` (or `fix/…`, `chore/…`). Never work on `main`.

## 3. Stage 1: Research and reference sheet (before writing code)

For every Medusa API, import, hook, step, option, CLI flag or env var the task needs, write one line in a **reference sheet**. It goes in the PR description later:

```
REF <symbol or rule> — <source> — <quoted line or file:line>
e.g. REF completeCartWorkflow.hooks.validate — MEDUSA_SKILL.md §6 (verified 2.21.1)
e.g. REF acquireLockStep — node_modules/@medusajs/core-flows/dist/locking/steps/acquire-lock.d.ts
```

- If `MEDUSA_SKILL.md` already covers it, cite the section.
- If not, use the **evidence ladder** (`MEDUSA_SKILL.md` §0) and cite the exact file or URL.
- **No reference means you don't use it.** Find one, or mark the task Blocked (§8).
- Check the matching **official reference** (`MEDUSA_SKILL.md` §13) and follow its structure unless the plan says otherwise.

## 4. Stage 2: Implement

- Use only the extension points in `BUILD_PLAN.md` §3.1: modules, links, workflows with compensation, hooks, subscribers, jobs, API routes with middlewares, admin extensions.
- Work in small increments. After each one, run Gate 1 (§5) before continuing.
- Every new write path goes through a **workflow** with compensation. Every new route gets **validation** and **auth** middleware.
- Custom modules: generate migrations with `pnpm medusa db:generate <module>` and commit the migration **and** its `.snapshot-*.json`.
- Tests are written **with** the code, not after (Gate 3).

## 5. Stage 3: Gates (run from the deployable folder; all must pass)

### Gate 1: Build and types
```bash
pnpm install --frozen-lockfile
pnpm build                 # backend: medusa build (also generates .medusa/types)
pnpm typecheck             # backend: tsc --noEmit (after build)
```
For storefronts, portals and the POS app, `pnpm build` must succeed **without the backend running** (BUILD_PLAN §4.2, change 5).

### Gate 2: Database and boot (backend)
Run against a **fresh** Postgres (`docker-compose.local.yml`), then once more against a database migrated by the previous commit (upgrade path):
```bash
pnpm medusa db:migrate --execute-safe-links --execute-safe-search
pnpm start &                                   # or the built image, see Gate 4
curl -fsS http://localhost:9000/health         # must return 200
curl -fsS -o /dev/null http://localhost:9000/app  # must return 200 (server/shared mode)
```
Also check that `db:migrate` printed no prompt and no "links to delete". An unsafe link or search change is a **release step** (BUILD_PLAN §8), not part of the task.

### Gate 3: Tests
```bash
pnpm test:unit
pnpm test:integration:modules   # src/modules/*/__tests__
pnpm test:integration:http      # integration-tests/http (routes, workflows, hooks)
```
Minimum test set per task:
- One test per **acceptance criterion** the task touches (named after the criterion).
- One **negative** test per validation rule, auth rule or hook rejection.
- One **idempotency / retry** test for anything that runs from events, jobs, or around `completeCartWorkflow`.
- A **concurrency** test where the plan names a race (booking holds, commissions, vendor order split).

### Gate 4: Container
```bash
docker build -t <category>-<app>:check <category>/<app>
```
Backend: run the image once with `MEDUSA_WORKER_MODE=server` (health 200) and once with `worker` + `DISABLE_MEDUSA_ADMIN=true` + `RUN_MIGRATIONS=false` (process starts, no HTTP admin). Clients: the image starts and serves its port.

### Gate 5: Guardrails (repo root; each line must print nothing unless noted)
Phase 0 turns these into `scripts/guard.sh`. Until then, run them by hand. `D` = the deployable folder.
```bash
git diff --name-only origin/main...HEAD -- BUILD_PLAN.md                       # plan is frozen
grep -rnE "from ['\"]@medusajs/[^'\"]+/dist" $D/src                            # no dist imports
grep -nE '"@medusajs/[^"]+": *"([\^~]|latest|\*)' $D/package.json             # exact pins only
grep -rnE "from ['\"]zod['\"]" $D/src                                          # use @medusajs/framework/zod
grep -rn -A2 "createWorkflow(" $D/src | grep -E "async +(function|\()"         # workflow fn not async
grep -rnE "@ts-ignore|@ts-nocheck|as any\b" $D/src                             # no type suppression
grep -n "patchedDependencies" $D/package.json $D/pnpm-workspace.yaml 2>/dev/null # no pnpm patch
git ls-files | grep -E '(^|/)\.env(\.[a-z]+)?$' | grep -v '\.env\.example$'    # no env files committed
grep -c -- "--execute-safe-links --execute-safe-search" $D/docker-entrypoint.sh 2>/dev/null  # backend: must print 1
```
Migrations of custom modules may only create or alter **their own prefixed tables**. Review `$D/src/modules/*/migrations/*.ts` for any `alter table` on a core table: that is forbidden.

## 6. Stage 4: Fix cycle (evidence-based, no guessing)

Run this loop for **each** failure from any gate, one failure at a time:

```
1. CAPTURE   exact command + first error message verbatim + file:line
2. CLASSIFY  compile/type | boot/config | migration | test assertion | behaviour vs acceptance | environment
3. EVIDENCE  find the rule that explains it, via the ladder (MEDUSA_SKILL §0):
               installed .d.ts  →  docs .md  →  official starter  →  release notes  →  package source
             write:  EVIDENCE <source> — "<quoted line>"
4. CAUSE     "Because <evidence>, the failure is caused by <X>."  (one sentence)
5. FIX       smallest change that the evidence supports; touch nothing else
6. RE-RUN    the failing command, then ALL gates again from Gate 1
7. LOG       append to the PR fix log: failure | evidence | cause | fix | result
```

**Allowed evidence** is only what you can point to: a file path with line, a docs URL with a quoted sentence, a starter file, a release note, or the tool's own error output. "I think", "usually" and "in other projects" are **not** evidence.

**Forbidden fixes** (never, even if they make the gate pass):
- Inventing or renaming an API, import or option without a reference.
- `any`, `@ts-ignore` or `@ts-nocheck` to silence types; loosening `tsconfig`.
- Skipping, deleting, `.only`-ing or weakening a test or assertion; changing acceptance criteria.
- `--no-verify`, disabling CI steps or guardrails.
- Loosening version pins, `pnpm patch`, editing `node_modules`, forking or copying core workflow code.
- Editing `BUILD_PLAN.md`.
- Running `db:sync-links --execute-all` or `db:migrate:search --execute-all-search` to make a gate pass.

**Stop rule:** if the same failure survives **3 fix attempts without new evidence**, STOP.
1. Mark the task `[!] Blocked` in `TASKS.md` with the captured error and the evidence gathered so far.
2. Report to the human. Do not keep trying variations.

## 7. Stage 5: Review (Reviewer hat)

Answer each question with yes or no plus a pointer. Any "no" sends the task back to the fix cycle.
1. Does the change do **exactly** what the plan section and task describe, and nothing more?
2. Does every Medusa symbol in the diff appear in the reference sheet with a valid source?
3. Do all acceptance criteria touched have a passing test named after them?
4. Do all write paths use workflows with compensation? Do all new routes have validation + auth + CORS where needed (custom prefixes)?
5. Are event, job and cart-completion code paths idempotent and tested for retry?
6. Are migrations and snapshots committed, touching only custom tables?
7. Did any new env var go into that deployable's `.env.example` with a comment (and its category README if it's a deploy setting)?
8. Are all Gates 1–5 green in the latest run?

Optional extra pass: run the `/code-review` skill on the branch.

## 8. Stage 6: Record in `TASKS.md`

- Tick the task: `- [x] P3-04 … — done: <short sha>, tests: <n passed>, refs: MEDUSA_SKILL §6`.
- Blocked: `- [!] … — blocked: <error>, evidence so far: <…>`.
- If reality contradicts the plan, add a row to **Plan deviations & findings log** in `TASKS.md`. Architecture or scope changes need human approval before you continue; implementation details (e.g. an exact method name) follow the evidence and are logged.

## 9. Stage 7: Commit

- Conventional commits, scoped by category: `feat(booking): add slot hold workflow`, `fix(pos): …`, `test(reseller): …`, `chore(ci): …`, `docs(skill): …`.
- One task per branch and PR. The commit includes code, tests, migrations, `.env.example` changes and the `TASKS.md` update.
- Commit only when Gates 1–5 are green **locally**.

## 10. Stage 8: Push, CI, merge

1. `git push -u origin <branch>` and open a PR using the template below.
2. CI must run the same gates (Phase 0 wires `scripts/verify.sh` + `scripts/guard.sh` per deployable).
3. If CI fails, go back to the fix cycle (§6), treating the CI log as the captured error.
4. Merge to `main` only when CI is green. Fast-forward or squash; never force-push `main`.
5. Dokploy redeploys only the changed deployables (watch paths). Smoke-test staging before production (BUILD_PLAN §8).

**PR description template**
```
Task: <ID> — <title>          Plan: BUILD_PLAN.md §<x.y>
Reference sheet:
  REF … — … — …
Gates: build ✅ typecheck ✅ migrate(fresh) ✅ migrate(upgrade) ✅ health ✅ tests <n>/<n> ✅ image ✅ guard ✅
Acceptance criteria covered: <list → test names>
Fix log:
  <failure> | <evidence> | <cause> | <fix> | <result>
Deviations logged: <none | TASKS.md row #>
```

## 11. Definition of Done (per task)

- [ ] Plan requirement implemented; nothing extra.
- [ ] Reference sheet complete; every symbol sourced.
- [ ] Gates 1–5 green locally **and** in CI.
- [ ] Acceptance-criteria tests, negative tests, and idempotency/concurrency tests where relevant.
- [ ] Migrations + snapshots committed; `.env.example` and README updated for new settings.
- [ ] `TASKS.md` ticked with evidence; deviations logged.
- [ ] Merged to `main` through a PR with CI green.
