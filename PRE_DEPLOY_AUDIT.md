# Pre-deployment audit: security, performance, reliability

Run this audit **before a category is promoted to staging or production** (BUILD_PLAN §8, P*-exit checklists). It has 10 checks. Each one says what to look at in *this* repo, the commands that give evidence, and what passing looks like.

**How to use it.** Give this file to the builder (Claude Code) with one target:

> Run `PRE_DEPLOY_AUDIT.md` for `<category>` (for example `booking-services`). Report every check with evidence. Don't change code during the audit.

## Rules for the audit

1. **Report first, fix later.** The audit reads code and runs commands; it does not refactor. Each finding becomes a `TASKS.md` task (or a *Plan deviations & findings log* entry) and is fixed through DEV_FLOW: branch per task, Gates 1–5, PR, CI green. Scope or architecture changes wait for owner approval (CLAUDE.md).
2. **Medusa first, no guessing.** Much of this list is already done by Medusa itself: the ORM, reset tokens, CORS options, the error handler. Cite the behaviour from `MEDUSA_SKILL.md` or its evidence ladder (§0) and verify it; don't rebuild it. A fix must use official extension points only (BUILD_PLAN §3.1): middlewares, workflows, hooks, modules, config. No core patches, no `node_modules` edits.
3. **Evidence or it didn't happen.** Every status needs a file:line, a command with its output, or an HTTP response. "Looks fine" is not a status.
4. **Scope.** Audit every deployable of the target category: `backend`, `storefront`, and any `*-portal` / `pos-app`. Categories without code (wholesale, reseller, marketplace today) are reported as "n/a".
5. **No secrets in the report.** Quote variable *names*, never values.

## Status values

| Status | Meaning |
|---|---|
| **PASS** | Verified with evidence |
| **FIX** | A gap that must be fixed before deploy → new task |
| **RISK** | Accepted or deferred, with the reason and an owner decision |
| **N/A** | Doesn't apply to this deployable (say why) |

---

## 1. Authorization and data isolation ("me" routes)

**Medusa baseline (MEDUSA_SKILL §7):** `/admin/*` needs an admin user and `/store/customers/me*` needs a customer. Custom routes are protected only if `src/api/middlewares.ts` adds `authenticate(...)`. The signed-in actor is `req.auth_context.actor_id`. There is no `user_id` column; data belongs to `customer_id`, a link (`order.bookings`), or a custom actor (cashier, vendor).

Check:
- List every custom route: `git grep -n "export const \(GET\|POST\|DELETE\|PUT\|PATCH\)" -- '<category>/backend/src/api'`.
- For each one that returns or changes per-user data, show the `authenticate(...)` matcher that covers it, and the line that scopes the query to `req.auth_context.actor_id`. An id from the URL or body must be checked against that actor, never trusted on its own.
- Routes that opt out with `AUTHENTICATE = false` must be public on purpose.
- Custom actors (cashier, vendor) can't reach another actor's data, and a customer token is refused on admin or actor routes.
- **Test it (IDOR):** customer A tries to read, cancel or update customer B's booking, order or address by id, through both the route and the storefront server action. Expect 404 or 401/403, never B's data. There should be an integration test for this; if not → FIX.

Pass when every per-user route has auth plus actor scoping, and an IDOR test exists and passes.

## 2. Password reset tokens

**Medusa baseline (MEDUSA_SKILL §15, "Account emails"):** `POST /auth/{actor}/emailpass/reset-password` always answers success, so it doesn't reveal which accounts exist. The token is **single-use and lasts 15 minutes**, and is used once on `POST /auth/{actor}/emailpass/update`. That meets "≤ 30 minutes, invalidated after use".

Check:
- No custom code issues its own reset or verification tokens with a longer life, logs them, or stores them in plain text: `git grep -niE "reset.?token|expires" -- '<category>/*/src'`.
- The reset email subscriber (`src/subscribers/auth-*.ts`) builds the link from `STOREFRONT_URL` or the admin URL, not from a request header (host-header injection).
- The storefront never puts the token in logs, analytics or a third-party URL. Check that the reset page drops the token from the URL after reading it.
- **Test:** use a token twice (2nd → 401), and use it after 15 minutes (→ 401). Cite the existing integration test (`account-auth.spec.ts`) or add one.
- Changing the password from the account (`password_change`) asks for the old password.

## 3. Input validation and injection

**Medusa baseline:** data access goes through the module services and `query.graph`, which use parameterized SQL (MikroORM/Knex). Request bodies are validated with `validateAndTransformBody` / `validateAndTransformQuery` using `z` from `@medusajs/framework/zod`.

Check:
- Every custom `POST`/`PUT`/`PATCH`/`DELETE` route and every custom `GET` with query params has a Zod schema in `middlewares.ts`. List any that read `req.body` or `req.query` without one: `git grep -n "req\.\(body\|query\)" -- '<category>/backend/src/api'`.
- Raw SQL is parameterized only: `git grep -nE "\.execute\(|\.raw\(|knex\.raw|sql\`" -- '<category>/backend/src'`. Each hit uses placeholders (`?` / bindings), never string concatenation or template interpolation of input.
- Zod schemas bound sizes: strings `.max()`, arrays `.max()`, numbers `.int().min().max()`, so a huge payload can't cost CPU or storage.
- **XSS:** `git grep -n "dangerouslySetInnerHTML" -- '<category>/*/src'`. Every hit renders trusted or sanitized HTML only. Admin widgets and email templates escape customer-entered text (names, notes, addresses).
- Outgoing calls built from input (webhooks, Telegram, payment) can't be pointed at arbitrary hosts (SSRF). Their URLs come from env, not from the request.
- Payment and other webhooks verify the signature inside the provider (`getWebhookActionAndData`, MEDUSA_SKILL §15).
- File uploads (if any) check type and size.

## 4. CORS and origins

**Medusa baseline (MEDUSA_SKILL §7):** `STORE_CORS`, `ADMIN_CORS` and `AUTH_CORS` apply to `/store*`, `/admin*` and `/auth*`. **Any other prefix** (`/pos`, `/vendors`, `/sellers`) needs its own `cors` + `parseCorsOrigins` middleware.

Check:
- `medusa-config.ts` reads the three variables from env only, and `.env.example` documents them.
- The staging/production values in Dokploy (names only in the report) list the exact client origins: `https://` and no `*`, no `localhost`, no trailing slash.
- Every custom prefix outside `/store`, `/admin` and `/auth` has its own CORS middleware fed from an env var (for example `POS_CORS`).
- Cookies: in production `SESSION_COOKIE_SECURE` must be unset or `true`. `false` is only for the local compose (F-043).
- **Test:** `curl -si -X OPTIONS <backend>/store/products -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"` must not echo `Access-Control-Allow-Origin: https://evil.example`.

## 5. Rate limiting

**Repo baseline (TASKS P1-21):** `src/api/auth-guards.ts` → `limitPerIp(name, limit, windowSeconds)` returns 429 with `Retry-After`. It is applied to customer `login`, `signup`, `password_reset`, `password_change` and `verification` (and `cashier_*` in pos). It counts **in memory**, which is correct only while the server runs **one replica** (BUILD_PLAN §5). The client IP comes from `x-shopper-ip` plus its shared secret, `CLIENT_IP_HEADER`, or `req.ip`.

Check:
- List the matchers: `git grep -n "limitPerIp(" -- '<category>/backend/src/api/middlewares.ts'`. Compare that list against every auth route the category exposes, including **admin login `/auth/user/emailpass*`** and its reset password route, and any custom actor's login. A missing one is a FIX, or a RISK with a reason: for example, admin is only reachable behind an IP allowlist.
- Costly or abusable public routes have a limit or a cheap guard. Examples: slot search, add to cart with holds (booking), search, contact forms, anything that sends email or Telegram, or creates payment sessions.
- The server replica count in Dokploy is still 1. If it is ever raised, the limiter must move to Redis first.
- `SHOPPER_IP_SECRET` is set on both backend and storefront in production. Without it, all shoppers share the storefront's IP and lock each other out.
- CAPTCHA (`CAPTCHA_PROVIDER`) is on for production signup and login, or there is a recorded RISK.
- **Test:** send `limit + 1` login attempts and expect a 429 with `Retry-After`. Cite `anti-abuse.spec.ts`.

## 6. Error handling and leaks

**Medusa baseline (MEDUSA_SKILL §7, "Errors"):** the error handler maps `MedusaError` types to 400/401/403/404/409. Unknown errors become 500 with a generic message.

Check:
- Custom routes and steps throw `MedusaError` with user-safe messages. No `res.json(err)`, `err.stack` or raw database messages are sent to clients: `git grep -nE "err(or)?\.stack|res\.(json|send)\(e(rr|rror)?\)" -- '<category>/*/src'`.
- `NODE_ENV=production` in every Dockerfile or Dokploy env.
- Storefront: `error.tsx` / `not-found.tsx` / `global-error.tsx` exist and show a friendly page. Server actions return friendly messages, not thrown backend text.
- Headers don't reveal versions where avoidable. Check for `x-powered-by` with `curl -sI <backend>/health` and `curl -sI <storefront>`; Next.js has `poweredByHeader: false`.
- **Test:** call a route with a bad id, a bad body and no auth. Each response is a short JSON error with no stack, SQL or file path.

## 7. Database indexes

Check:
- Each custom DML model (`src/modules/*/models/*.ts`) has `.indexes()` or `.index()` on the columns its service and routes filter, join or sort by: foreign ids (`customer_id`, `cart_id`, `resource_id`), status plus time ranges, `deleted_at`-aware unique keys.
- Module links (`defineLink`) get their pivot table indexes from Medusa. Don't add them by hand.
- Generated migrations match the models (`npx medusa db:generate <module>` produces no new migration on a clean tree).
- Hot queries: on a staging copy with realistic data, run `EXPLAIN ANALYZE` for the 3–5 most frequent custom queries (for example booking slot overlap and expired-hold release). Expect index scans and times in milliseconds.
- Jobs that scan tables (`src/jobs/*`) filter on indexed columns and work in batches.
- No N+1 patterns: a loop that calls a service or `query.graph` once per item, where one call with an `id: [...]` filter would do.

## 8. Logging and monitoring

**Medusa baseline:** use the container `logger` (`container.resolve("logger")`) in backends, never `console.log` with request data. `instrumentation.ts` is the official OpenTelemetry hook; it ships commented out.

Check:
- `git grep -n "console\.\(log\|error\)" -- '<category>/backend/src'` returns nothing, or only intended lines. Logs never include tokens, passwords, full card or payment data, or full personal data.
- Failures in jobs, subscribers and payment webhooks are logged with ids, so a failed order or booking can be traced.
- Dokploy health checks are set on every app (`/health` for backends; the storefront route documented in `<category>/README.md` / `DOKPLOY_STAGING.md`).
- Alerting: who learns that the backend is down, a deploy rolled back, a job keeps failing, or the database backup failed, and how? Dokploy notifications and the Telegram staff bot are options. If nothing alerts → FIX or a recorded RISK.
- Optional: enable `instrumentation.ts` with an exporter only after an owner decision, because it is a new dependency and service.

## 9. Secrets

Check:
- `scripts/guard.sh <category>` passes. It fails on any tracked `.env*` file except `.env.example`.
- No hard-coded keys: `git grep -nIE "(sk|pk)_(live|test)_[A-Za-z0-9]{8,}|re_[A-Za-z0-9]{16,}|[0-9]{8,10}:[A-Za-z0-9_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY" -- . ':!*pnpm-lock.yaml'`. These patterns cover Stripe-style keys, Resend, Telegram bot tokens and private keys. Publishable keys (`pk_`) are public by design, but must still come from env.
- `JWT_SECRET`, `COOKIE_SECRET`, `SHOPPER_IP_SECRET`, `REVALIDATE_SECRET`, payment keys and `AUTH_MFA_ENCRYPTION_KEY` are read from env only. Production values are long and random and differ from staging and from the `local-only-*` compose values.
- `NEXT_PUBLIC_*` variables hold nothing secret (they are built into client JavaScript): `git grep -n "NEXT_PUBLIC_" -- '<category>/*/src' '<category>/*/Dockerfile'`.
- `.gitignore` covers `.env`, `.env.local` and build output. Docker images don't copy `.env` (check `.dockerignore`).
- Git history: no secret was ever committed, or any that was has been rotated. Spot-check with `git log -p -S "<variable name>="`.

## 10. Rollback and deployment safety

**Repo baseline:** Dokploy Swarm **Update Config** uses Failure Action **Rollback**, Order **Start First** (backend and storefront) or **Stop First** (worker), and health checks. Each app has watch paths and is redeployed or rolled back on its own (BUILD_PLAN §5 and §8, `<category>/DOKPLOY_STAGING.md`). Migrations run only on the server instance: `medusa db:migrate --execute-safe-links --execute-safe-search` (guard check 10).

Check:
- Dokploy settings for every app match the runbook: health check, Update Config, watch paths, and server replicas = 1.
- **Migrations are backward compatible (expand → contract).** New columns are nullable or have defaults; no column or table is dropped or renamed in the same release that stops using it. The previous image must still run on the migrated database. Review `git diff <last-deployed-sha> -- '<category>/backend/src/modules/*/migrations'`.
- `medusa db:rollback <module>` is the documented way back for a custom module migration (MEDUSA_SKILL §11). Test it on staging for every new migration, or mark it as forward-only with a reason.
- A database backup ran successfully before the production deploy, and one restore has been tested (README "Database backups", runbook §7).
- Versioning: the deploy is a known git commit on `main` (CI `ci-ok` green). Production promotes **the same commit** that passed staging. Record the previous good commit so a redeploy of it is one click.
- `@medusajs/*` pins are exact and identical across the deployable; `pnpm install --frozen-lockfile` works (guard check 4, Gate 1).
- Dependency vulnerabilities: run `pnpm audit --prod` in each deployable. Any high or critical item → FIX or a recorded RISK, in this order (plan §3.2): (1) a direct dependency of ours → bump its exact pin; (2) a transitive one → refresh the lockfile within the ranges Medusa and the starter already allow (`pnpm update <pkg…> --depth 99`, `@medusajs/*` pins unchanged; done for E-A6 on 2026-11-06); (3) still open → a Medusa update (`scripts/update-medusa.sh`) or an owner-accepted RISK in plan §10 (R-i). A `pnpm.overrides` entry is a deviation that needs owner approval.

---

## Gates to run with the audit

```bash
scripts/guard.sh <category>
```
```bash
scripts/verify.sh <category> --image
```
```bash
cd <category>/backend && pnpm audit --prod
```

## Report template

Write the report as `<category>/AUDIT-<YYYY-MM-DD>.md` (or paste it in the PR), then copy each FIX into `TASKS.md`.

```markdown
# Pre-deploy audit: <category> @ <commit sha>, <date>

| # | Check | Status | Evidence (file:line / command / response) | Follow-up task |
|---|---|---|---|---|
| 1 | Authorization & data isolation | | | |
| 2 | Password reset tokens | | | |
| 3 | Input validation & injection | | | |
| 4 | CORS & origins | | | |
| 5 | Rate limiting | | | |
| 6 | Error handling & leaks | | | |
| 7 | Database indexes | | | |
| 8 | Logging & monitoring | | | |
| 9 | Secrets | | | |
| 10 | Rollback & deploy safety | | | |

Gates: guard <pass/fail>, verify --image <pass/fail>, pnpm audit <n high / n critical>.
Go / no-go: <decision and who made it>.
```

A category is ready to deploy when every row is PASS, N/A, or RISK with an owner decision, and the gates are green.
