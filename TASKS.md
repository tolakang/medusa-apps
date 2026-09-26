# Development Task List

> Built from `BUILD_PLAN.md` (frozen). Work through it with `DEV_FLOW.md`, using `MEDUSA_SKILL.md` as the only Medusa reference.
> **This file is the living tracker.** Update it at the end of every task (DEV_FLOW §8). Never edit `BUILD_PLAN.md`.

**Legend:** `[ ]` to do · `[~]` in progress · `[x]` done (`— done: <sha>, tests: <n>, refs: <…>`) · `[!]` blocked (`— blocked: <error>, evidence: <…>`)

**Order rules** (plan §7): Phases 0 and 1 first. Phases 2–4 may be reordered by business priority. Phase 6 comes after Phase 5. Don't run two "L" phases at once. Inside a phase: backend → storefront → portal/app.

| Phase | Category | Size | Status |
|---|---|---|---|
| 0 | Foundation (in `ecommerce/`) | M | In progress: local work and all Phase 0 decisions done; CI green; waiting on Dokploy staging (P0-18/19) |
| 1 | Ecommerce | S | Not started |
| 2 | POS | M | Not started |
| 3 | Booking services | M–L | Not started |
| 4 | Wholesale | M | Not started |
| 5 | Reseller | M–L | Not started |
| 6 | Marketplace | L | Not started |

### Phase exit checklist (copy under every phase when closing it; plan §7)
- [ ] CI gate green for every deployable in the category
- [ ] Whole category deployed to a Dokploy **staging** project using only committed `Dockerfile`s and `.env.example`s
- [ ] One Medusa update done with `scripts/update-medusa.sh` (dry run allowed if no newer version exists)
- [ ] Each app redeployed alone once (independence proven)
- [ ] All acceptance criteria of the phase have passing tests

---

## Phase 0: Foundation (`ecommerce/`) · plan §2–§5, §7, §8

**Decisions needed first**
- [x] P0-01 Re-check Medusa, pnpm and Node versions on the start day (MEDUSA_SKILL §1). If they changed, refresh the skill (§14) and log it. Don't edit the plan. — done: unchanged (Medusa 2.21.1, pnpm 12.6.0, Node `^20.19 \|\| >=22.12`); dtc-starter `e3a237c9b877` pins 2.21.1
- [x] P0-02 Decide **D3** file storage (S3 / R2 / MinIO) and **D6** staging setup. Record them in the Decisions log below. — done: D3 = AWS S3, D6 = separate `<category>-staging` Dokploy project; both in the Decisions log, env examples and `ecommerce/README.md`

**Backend standard (`ecommerce/backend`) · plan §4.1**
- [x] P0-03 Copy `apps/backend` from `medusajs/dtc-starter` at the version-matching commit. Record the commit in `ecommerce/backend/README.md`. Rename the package. — done: f717457, starter `e3a237c9b877` (demo seed moved out of migration-scripts, F-002)
- [x] P0-04 Set up pnpm: `packageManager: pnpm@<exact>`; `pnpm-workspace.yaml` with `publicHoistPattern` + `allowBuilds` (no `packages:` key); exact `@medusajs/*` pins (`@medusajs/ui` on its own line). — done: f717457; `@medusajs/ui` now 4.2.5 = the dashboard's dependency (F-006 decided)
- [x] P0-05 Add the scripts `predeploy` (`medusa db:migrate`), `typecheck` (`tsc --noEmit`) and the three test scripts (MEDUSA_SKILL §10). — done: f717457 (+ `seed:*`; `predeploy` uses safe flags)
- [x] P0-06 Write an env-driven `medusa-config.ts` per plan §4.1 and MEDUSA_SKILL §2: `redisUrl`, conditional Redis modules (caching + `@medusajs/caching-redis`, event-bus, workflow-engine, locking), `MEDUSA_FF_CACHING`, conditional S3, `workerMode`, `admin.disable`/`backendUrl`. — done: f717457 (+ `DATABASE_SSL`, F-003)
- [x] P0-07 Gate 1 green (install, build, typecheck). — done: f717457, build and `tsc --noEmit` exit 0
- [x] P0-08 Keep the committed `Dockerfile`, `docker-entrypoint.sh` (safe migrate flags) and `.env.example`. Adjust only if evidence requires it, and log it. — done: templates unchanged except `DATABASE_SSL=false` in all 6 backend `.env.example` (F-003)
- [x] P0-09 Gate 2 + Gate 4: image builds. Server container: migrations run, `/health` 200, `/app` 200. Worker container starts with admin disabled and no migrations. — done: f717457; fresh DB migrate ok, `/health` 200, `/app/` 200, worker `/app/` 404, both uid `node`; the worker waits for a healthy server

**Web client standard (`ecommerce/storefront`) · plan §4.2**
- [x] P0-10 Copy `apps/storefront` from `dtc-starter` and record the commit. Apply starter changes 1–5 (6 optional, decide and log). — done: 159252e, changes 1–6 applied; change 6 proven (bogus runtime URL → SSR 500, correct → 200)
- [x] P0-11 `pnpm build` succeeds with the backend **down** (static-params guards). The image builds and serves on 8000. — done: 159252e; build with the backend down ok; container `/dk` 200, product SSR 200

**Tooling · plan §4.3, §8**
- [x] P0-12 `docker-compose.local.yml` (Postgres + Redis + backend + storefront). — done: f717457 + 159252e (`ecommerce/docker-compose.local.yml`)
- [x] P0-13 `scripts/verify.sh <category>` = DEV_FLOW Gates 1–4 (fresh DB and upgrade-path DB). — done: ba32c02; ran `verify.sh ecommerce --image` PASS, image smoke on a fresh DB `/health` 200. Upgrade path = point `VERIFY_DATABASE_URL` at a copy of the previous version's DB (first used at the first real update)
- [x] P0-14 `scripts/guard.sh` = DEV_FLOW Gate 5, including "BUILD_PLAN.md unchanged". — done: ba32c02 (checksum `.build-plan.sha256`; negative test caught a planted `as any`)
- [x] P0-15 `scripts/update-medusa.sh <category|category/app|all> [version]` per plan §8. — done: ba32c02; rehearsal on 2.21.1 → no diff, verify PASS
- [x] P0-16 Integration-test skeleton: one `integration-tests/http` test and one module test, running with a Postgres service. — done: f717457, `integration-tests/http/health.spec.ts` 2/2 on real Postgres; module suite wired (`--passWithNoTests`), and the first module test lands with the first custom module (Phase 2)
- [x] P0-17 CI matrix: one job per deployable running verify + guard. Dependabot/Renovate per folder, grouping `@medusajs/*` per category. — done: e3d988a; first run on PR #1 (run 36136903265, head 1bfe394) green: guard PASS, verify backend (tests 2/2, image smoke `/health` 200) PASS, verify storefront PASS. Dependabot replaced by `medusa-update-check.yml` (F-008 approved)

**Deploy · plan §5**
- [x] P0-18 Dokploy staging project: Postgres, Redis, backend server, worker, storefront. Build paths, watch paths, health check `/health`, first-deploy order. — done 2026-09-26: `ecommerce-staging` backend live at api2.nokor24.com (`/health` 200, `/app/` 200, store w/o key 400, admin w/o login 401, CORS shop2 allowed / foreign refused); admin user + staging seed done; storefront live at shop2.nokor24.com (2026-09-26: `/dk/products/t-shirt` 200 with title "Medusa T-Shirt | Medusa Store" server-rendered, `/dk/products/does-not-exist-xyz` 404, baked key `pk_c26703b7c…` → `/store/products` count 4); worker `ecommerce-worker` live (2026-09-26 00:12 UTC log: `Starting Medusa (worker mode: worker)`, Redis event-bus/locking/workflow-engine/cache connected, no errors); Swarm health checks set and verified on backend and storefront (F-018): backend 212/212 `/health` 200 across its redeploy (12:18 to 12:26 UTC), storefront `exit=0` in-container test, then 177/177 `/dk` + `/favicon.ico` 200 across its redeploy (12:30 to 12:38 UTC, Next ready 12:32:43, past the failure window)
- [ ] P0-19 Independence proof: redeploy each app alone, then roll one back. — in progress. Step 1 done 2026-09-26: backend deployed alone (container start 12:21 UTC), storefront alone (12:32), worker alone (12:46:31, worker mode, Redis modules connected, no errors). After each deploy the other apps' logs showed no new startup, and backend `/health` + storefront `/dk` returned 200 on 116/116 checks during the worker deploy (12:43:58 to about 12:51). Worker Swarm Update Config set (`stop-first`, rollback). Step 2 first run (PR #4, merged 12:56:14 UTC; changed `ecommerce/storefront/Dockerfile` + docs outside all watch paths): storefront auto-deployed (ready 12:58:15) ✅, backend did not (still 12:21:34) ✅, **worker did (13:01:35)** ❌ because its Watch Paths box was empty (F-019). Backend `/health` + storefront `/dk` 200 on 247/247 checks (12:52 to 13:07). Worker Watch Paths set to `ecommerce/backend/**`; step 2 re-run with a PR that changes only `ecommerce/storefront/README.md` + docs.
- [ ] P0-20 Phase exit checklist.

---

## Phase 1: Ecommerce · plan §6.1

- [ ] P1-01 Decide **D1** payment providers, **D2** notification channels and **D4** storefront design. Log them.
- [ ] P1-02 Seed script (`src/scripts/seed.ts`, `medusa exec`): regions, currencies, tax, shipping options, sales channel, publishable key.
- [ ] P1-03 Stripe provider (`apiKey`, `webhookSecret`); webhook at `/hooks/payment/stripe_stripe`; env documented.
- [ ] P1-04 Notification provider (email; `notification-local` in dev) + order-confirmation subscriber on `order.placed` (idempotent).
- [ ] P1-05 S3 file provider: admin image upload works and the storefront renders it through `S3_IMAGE_*`.
- [ ] P1-06 Search: product index (`src/search/product.ts`) works, and storefront search returns results.
- [ ] P1-07 **Acceptance test:** browse → cart → checkout → order visible in admin (integration test + manual staging run).
- [ ] P1-08 Production deploy runbook executed (backup first, one server replica while migrating).
- [ ] P1-09 Phase exit checklist.

---

## Phase 2: POS · plan §6.2

**Backend (`pos/backend`, copied from the Phase 1 standard)**
- [ ] P2-01 Module `pos`: `pos_register`, `pos_shift` (fields per plan) + migrations.
- [ ] P2-02 Links: register → stock location, register → sales channel, shift → orders.
- [ ] P2-03 Actor type `cashier`: register/login flow, `authenticate("cashier", …)` on `/pos/*`, `POS_CORS` middleware. **No admin users for cashiers.**
- [ ] P2-04 Workflows: `open-shift` (one open shift per register), `close-shift` (expected cash, variance).
- [ ] P2-05 Workflow `pos-checkout` through **draft orders** (convert → order), promotions, payment record, link order → shift.
- [ ] P2-06 Routes `/pos/registers`, `/pos/shifts/open|close`, `/pos/checkout`, `/pos/customers`, barcode lookup (`barcode`/`ean`/`upc`/`sku`); `/admin/pos/*` for setup and reports.
- [ ] P2-07 Admin: shift report page (per register / cashier / day).
- [ ] P2-08 Decide **D5** (PWA vs native) and log it.

**Clients**
- [ ] P2-09 `pos/storefront` from the standard (same stock, online channel key).
- [ ] P2-10 `pos/pos-app` (Next.js PWA): login, scan, cart, customer lookup, payment (cash / card / QR), receipt.

**Acceptance tests**
- [ ] P2-11 A register sale reduces stock **only** at that shop's stock location.
- [ ] P2-12 Shift close computes the correct cash variance.
- [ ] P2-13 A cashier token can't call `/admin/*`.
- [ ] P2-14 Phase exit checklist.

---

## Phase 3: Booking services · plan §6.3

**Backend**
- [ ] P3-01 Module `booking`: `booking_resource`, `booking_schedule`, `booking` (UTC times, statuses, hold fields) + migrations.
- [ ] P3-02 Links: resource ↔ product variant (many-to-many), booking → order.
- [ ] P3-03 Service: `isSlotAvailable` (overlap + capacity; holds count only until they expire), `createHold`.
- [ ] P3-04 Workflow `add-booking-to-cart`: hold and line item together, with compensation.
- [ ] P3-05 Hooks: `addToCartWorkflow.validate` (slot available), `updateLineItemInCartWorkflow.validate` (capacity), `completeCartWorkflow.validate` (read-only, own hold counts as valid, idempotent).
- [ ] P3-06 Extend the hold when the payment session is created.
- [ ] P3-07 Subscriber `order.placed` → confirm bookings + link to order (idempotent).
- [ ] P3-08 Workflow `cancel-booking`: policy (`BOOKING_CANCEL_HOURS`) + refund.
- [ ] P3-09 Jobs: release expired holds (every minute); reminders 24 h before.
- [ ] P3-10 Routes: `GET /store/booking/availability`, `GET /store/booking/slots`, `POST /store/booking/cancel`.
- [ ] P3-11 Admin: day/week calendar per resource; walk-in booking.
- [ ] P3-12 Services as products without shipping. Ticket-style events use the recipe's inventory approach.

**Client**
- [ ] P3-13 `booking-services/storefront`: service pages, slot picker, booking management in the account.

**Acceptance tests**
- [ ] P3-14 **Concurrency:** two customers can't hold the same slot.
- [ ] P3-15 An abandoned checkout frees the slot automatically (job).
- [ ] P3-16 Cancellation inside the policy refunds; outside it doesn't.
- [ ] P3-17 A retried cart completion doesn't double-book or fail on its own hold.
- [ ] P3-18 Phase exit checklist.

---

## Phase 4: Wholesale · plan §6.4

**Backend (from `medusajs/b2b-starter` `apps/backend`)**
- [ ] P4-01 Copy the b2b-starter backend at the version-matching commit (record it) and bring it to the repo standard (pnpm, pins, config, Docker, env).
- [ ] P4-02 Extend `company`/`employee`: payment_terms, credit_limit, tax_id, status, spending_limit, is_admin + migrations.
- [ ] P4-03 B2B sales channel + publishable key; price lists per customer group (`customer.groups.id`); quantity tiers (`min_quantity`/`max_quantity`).
- [ ] P4-04 Hooks: `addToCartWorkflow.validate` (MOQ, approved company); `completeCartWorkflow.validate` (spending limit, credit limit).
- [ ] P4-05 Quotes and approvals from the starter wired to plan rules (approval above a limit).
- [ ] P4-06 Net terms via `pp_system_default`; invoice PDF.
- [ ] P4-07 Routes `/store/companies/me`, `/store/companies/me/employees`, `/store/quotes`; `WHOLESALE_REQUIRE_APPROVAL`.

**Client (from the b2b-starter `apps/storefront`)**
- [ ] P4-08 Login required, bulk add by SKU/CSV, reorder, invoices, quotes, company users.

**Acceptance tests**
- [ ] P4-09 A Gold company sees Gold prices.
- [ ] P4-10 An employee over their limit can't complete checkout; a company over its credit limit can't either.
- [ ] P4-11 Phase exit checklist.

---

## Phase 5: Reseller · plan §6.5

**Backend**
- [ ] P5-01 Module `seller`: `seller`, `seller_commission` (`order_id` unique) + migrations.
- [ ] P5-02 Link seller ↔ sales channel (one-to-one).
- [ ] P5-03 Actor type `seller` + `/sellers/*` auth + `SELLER_CORS` middleware; portal domains in `AUTH_CORS`.
- [ ] P5-04 `record-seller-commission` (subscriber `order.placed`, idempotent, skips channels without an active seller); `cancel-commission`.
- [ ] P5-05 Monthly payout batch job (`RESELLER_PAYOUT_DAY`).
- [ ] P5-06 Routes `/sellers/me`, `/sellers/me/products`, `/sellers/me/commissions`.

**Clients**
- [ ] P5-07 `reseller/storefront`: resolve domain → seller server-side; **per-request `x-publishable-api-key`** in the starter's `sdk.client.fetch` wrapper; CORS regex or server-side calls.
- [ ] P5-08 `reseller/seller-portal`: product selection, sales, commissions.

**Acceptance tests**
- [ ] P5-09 An order in a seller's channel creates **exactly one** commission, even when the event is processed twice.
- [ ] P5-10 Orders in your own channel create none.
- [ ] P5-11 Phase exit checklist.

---

## Phase 6: Marketplace · plan §6.6

**Backend**
- [ ] P6-01 Module `marketplace`: `vendor`, `vendor_admin`, `vendor_payout` + migrations.
- [ ] P6-02 Links: vendor → products, vendor → orders (child), vendor → stock locations.
- [ ] P6-03 Actor type `vendor` (vendors example flow), signup → admin approval, `/vendors/*` scoped by vendor, `VENDOR_CORS` middleware.
- [ ] P6-04 Workflows `create-vendor`, `create-vendor-product` (draft until approved when `MARKETPLACE_REQUIRE_PRODUCT_APPROVAL`).
- [ ] P6-05 `POST /store/carts/:id/complete-vendor` + `create-vendor-orders` workflow (lock, `completeCartWorkflow` as a step, group by vendor, `createOrderWorkflow` per vendor, link check, compensation).
- [ ] P6-06 `record-vendor-commission`; scheduled `create-payouts` (`MARKETPLACE_PAYOUT_DAY`); manual payout report.
- [ ] P6-07 Admin: vendor approval queue, product moderation, payout report, parent/child order filter.

**Clients**
- [ ] P6-08 `marketplace/storefront`: vendor name/shop pages; checkout calls `complete-vendor`.
- [ ] P6-09 `marketplace/vendor-portal`: products, orders, fulfillments, payouts.

**Acceptance tests**
- [ ] P6-10 A two-vendor cart produces two child orders, each visible to and fulfillable by its vendor only.
- [ ] P6-11 Payouts equal order totals minus commission.
- [ ] P6-12 A retried `complete-vendor` creates no duplicate child orders.
- [ ] P6-13 Phase exit checklist.

---

## Session handoff (2026-09-26): start here in a new session

Current position: **Phase 0**. P0-01 to P0-17 are done, and PR #1 and PR #2 are merged (`main` = `530b3ce`). **P0-18 is in progress** on Dokploy project `ecommerce-staging`, following `ecommerce/DOKPLOY_STAGING.md`.

**Staging status (checked from outside):**
- Backend `https://api2.nokor24.com`: live. `/health` 200, `/app/` 200, store API without key 400, admin API without login 401, CORS allows `https://shop2.nokor24.com` and refuses foreign origins. The admin user is created and the staging demo seed has run.
- Storefront `https://shop2.nokor24.com`: `/` redirects to `/dk`; `/dk`, `/dk/store` and `/dk/categories/shirts` return 200. Product pages work (2026-09-26): `/dk/products/t-shirt` 200 with the title server-rendered, `/dk/products/does-not-exist-xyz` 404. The F-015 fix is deployed and the storefront uses the seed's key (`pk_c26703b7c…`, count 4), fixing F-017.
- Worker `ecommerce-worker`: live (2026-09-26). Log shows worker mode, all Redis modules connected, no errors. Medusa still listens on 9000 in worker mode (runbook section 3 corrected).

**Next steps, in order (the operator clicks in Dokploy; the builder verifies with curl):**
1. ~~Storefront publishable key~~ and 2. ~~product page checks~~: done 2026-09-26 (see status above).
3. ~~Set up the worker~~ done 2026-09-26. Was: set up the worker (runbook section 3; same `DATABASE_URL`/`REDIS_URL` as the backend, plus the three worker overrides).
4. ~~Tick P0-18~~ done 2026-09-26. Next: P0-19 (runbook section 6) and the P0-20 phase exit.

**Health check question: answered 2026-09-26.** The Swarm Health Check box was **empty** on both `ecommerce-backend` and `ecommerce-storefront`, so an empty or cleared health check most likely ended the first 502. The runbook's JSON matches Dokploy's documented format (zero-downtime docs: the same fields and nanosecond units; we use `node` because the images have no `curl`). **Backend:** health check set and redeployed. New container `Server is ready on port: 9000` at 12:21:34 UTC; `/health` returned 200 on 212 checks from 12:18 to 12:26 UTC, past the point where a failing check would have restarted it; the JSON stayed saved. **Storefront:** in-container test `exit=0`, health check set and redeployed. Next.js ready at 12:32:43 UTC; `/dk` and `/favicon.ico` returned 200 on 177 checks from 12:30:39 to about 12:38:40 UTC; the operator confirmed the JSON stayed saved, past the ~2.5 min failure window. **P0-18 done.**

**Operator notes:** don't paste real secrets into chat (a Redis password was pasted on 2026-09-25; rotating it is recommended). The Dokploy terminal opens in `/`; images built from `main` ≥ `87f6ca7` handle that (F-013).

## Decisions log (plan §10)

| ID | Decision | Needed by | Choice | Date | Evidence / reason |
|---|---|---|---|---|---|
| D1 | Payment providers per project; split payments? | Phase 1 | | | |
| D2 | Notification channels | Phase 1 | | | |
| D3 | File storage provider | Phase 0 | **AWS S3** | 2026-09-25 | `medusa-config.ts` already enables `file` + `@medusajs/file-s3` when `S3_BUCKET` is set (plan §4.1 env table). AWS needs no `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE=false`; those stay for R2/MinIO. Documented in all 6 `backend/.env.example` and the storefront's `S3_IMAGE_HOSTNAME`. Wiring and proof are P1-05. |
| D4 | Storefront design (starter look vs restyle) | Phase 1 | | | |
| D5 | POS app: PWA vs native | Phase 2 | | | |
| D6 | Staging environment in Dokploy | Phase 0 | **Separate Dokploy project `<category>-staging`** | 2026-09-25 | Plan §10 D6 ("separate project, separate databases") and §7 phase exit. Own Postgres, Redis and bucket/prefix; same folder, Build Paths, watch paths and `.env.example` keys, different values and staging domains. Written up in `ecommerce/README.md` → *Staging project*. Building it is P0-18. |

## Plan deviations & findings log

Record anything where verified evidence differs from or adds to `BUILD_PLAN.md`. The plan itself is **not** edited.

| # | Date | Plan § | Finding | Evidence | Action | Approved by |
|---|---|---|---|---|---|---|
| F-002 | 2026-09-25 | 5, 6.1 | The starter ships a demo seed in `src/migration-scripts/`, which **runs automatically on every `db:migrate` in production**. | `db:migrate` log (runs migration scripts); CLI reference `db:migrate` | Moved to `src/scripts/seed-initial-data.ts` (`pnpm seed:initial`). `guard.sh` blocks seeds in migration-scripts. Matches the plan §5 manual first-deploy setup. | Implementation detail |
| F-003 | 2026-09-25 | 4.1 env table | Medusa turns Postgres **SSL on** for any non-localhost `DATABASE_URL`, so migrations hang on the Dokploy/compose Postgres ("connection timed out after 10 seconds"). `?ssl_mode=disable` alone did not fix it. | `@medusajs/utils/.../load-module-database-config.js` `getDefaultDriverOptions`; reproduced and fixed | New env `DATABASE_SSL` (false/true/unset) → `projectConfig.databaseDriverOptions`. Added to all 6 backend `.env.example` (`false`). | Implementation detail (new env var) |
| F-004 | 2026-09-25 | 10 (R-h) | The plan says `db:migrate` takes no lock. It takes a per-module advisory lock (`pg_advisory_xact_lock`). | `@medusajs/modules-sdk/dist/medusa-app.js` | "One server replica while migrating" is still the rule. MEDUSA_SKILL corrected. | No change needed |
| F-005 | 2026-09-25 | 5 (first deploy) | Medusa 2.21.1 creates a default sales channel and a "Default Publishable API Key" on first server boot. | `api_key.created_at` = first boot, before any seed | First deploy: regions still have to be created; reuse the default channel and key, or create a dedicated one. | Informational |
| F-006 | 2026-09-25 | 3.2 | `@medusajs/dashboard@2.21.1` depends on `@medusajs/ui` **4.2.5**, but dtc-starter pins **4.2.4**, so the lockfile held both. | `npm view @medusajs/dashboard@2.21.1 dependencies`; `pnpm-lock.yaml` | **Decided: match the dashboard.** `ecommerce/backend` pins `@medusajs/ui` 4.2.5; the lockfile now holds one copy. `update-medusa.sh` reads the pin from `@medusajs/dashboard@<target>` (dtc-starter pin only as fallback) and notes when the starter differs. Deviation from plan §3.2 ("starter pin"). | Human (tolakang), 2026-09-25 |
| F-007 | 2026-09-25 | — | Integration-test teardown logs `[Search] Failed to seed "product" … terminating connection`: the Search Module seeds on app start while the runner drops the DB. Tests pass. | test output; stack in `SearchModuleService.onApplicationStart_` | Documented in MEDUSA_SKILL §12 as noise. | Informational |
| F-008 | 2026-09-25 | 8 (automation) | Dependabot supports pnpm **v7–v10**; this repo pins pnpm **12.6.0**. Renovate support for pnpm 12 is unverified. | docs.github.com "Supported ecosystems" (pnpm row) | **Approved:** no Dependabot/Renovate. Weekly `medusa-update-check.yml` (Mondays 02:00 UTC + `workflow_dispatch`) fails visibly when a pin is behind npm `latest`; a human then runs `update-medusa.sh` on a branch. Deviation from plan §8 ("Dependabot/Renovate per folder"). | Human (tolakang), 2026-09-25 |
| F-009 | 2026-09-25 | 4.1 | Production `medusa start` must run inside `.medusa/server` (from the root: "Could not find index.html…"). | docs `learn/deployment/general`; reproduced | The Dockerfile already does this; DEV_FLOW Gate 2 corrected. | Implementation detail |
| F-010 | 2026-09-25 | 4.2 | A stray `~/yarn.lock` made Next.js trace from `/Users/kt`, so `server.js` was not at the standalone root. | `.next/standalone/Documents/...`; Next type docs for `outputFileTracingRoot` | `outputFileTracingRoot: __dirname` in `next.config.js` (deterministic on any machine). | Implementation detail |
| F-011 | 2026-09-25 | 5 (Build Path) | On Dokploy the Dockerfile fields are **relative to the repo root**: working setup = Build Path `/`, Docker File `<category>/<app>/Dockerfile`, Docker Context Path `<category>/<app>`. The plan's "Build Path `/<category>/backend`" wording is about the app folder. | staging deploy of ecommerce-backend (build log `load build definition from Dockerfile`, image written) | Runbook + all six category READMEs corrected. | Implementation detail |
| F-012 | 2026-09-25 | 5 | A Redis URL pasted into `DATABASE_URL` makes `db:migrate` hang 60 s (`Knex: Timeout acquiring a connection`) and the domain shows 502. Easy operator mistake with a misleading error. | staging logs | Runbook warns at the env step. Option (not done, needs approval): the entrypoint fails fast when `DATABASE_URL` is not `postgres(ql)://`. | Informational |
| F-013 | 2026-09-25 | 5 (first deploy) | The Dokploy terminal opens in `/`; `docker-entrypoint.sh medusa user …` failed with "must be run inside a Medusa project". | staging terminal output; reproduced locally with `podman exec -w /` | All six entrypoints `cd /app`. Verified: same command from `/` → "User created successfully." | Implementation detail |
| F-014 | 2026-09-25 | — | On linux/arm64 (Oracle) builds, `msgpackr-extract` (optional native add-on of `msgpackr`) fails to load its prebuilt and to compile (no Python). pnpm continues; `msgpackr` uses its JS fallback. | Dokploy build log; `pnpm-lock.yaml` (`msgpackr` → `optionalDependencies: msgpackr-extract`) | Noise, no action. | Informational |
| F-015 | 2026-09-25 | 4.2 (starter) | Storefront product pages returned 500 (`digest: 'DYNAMIC_SERVER_USAGE'`) in the Docker image on staging and locally. The starter's `src/lib/data/cookies.ts` wraps `cookies()` in `try/catch`, swallowing the `DynamicServerError` Next uses to switch a static/ISR render to dynamic (Next docs "DynamicServerError - Dynamic Server Usage"). Upstream: medusajs/nextjs-starter-medusa#439 / #481 (the #482 "fix" added that try/catch). | reproduced with the storefront image + staging values; fixed image: product pages no 500, `DYNAMIC_SERVER_USAGE` count 0 | Starter change 7: `export const dynamic = "force-dynamic"` on `products/[handle]/page.tsx` (stable Next route segment config; `unstable_rethrow` rejected: docs say not for production). | Implementation detail (starter change beyond plan §4.2 list) |
| F-016 | 2026-09-25 | 4.2 | A typo in the storefront build-time `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (`api.` instead of `api2.`) showed up only at runtime as `Backend returned 502` in the middleware and a 500 on every page. | baked URL read from `.next/server/src/middleware.js` | Runbook check added (grep the baked URL). | Informational |
| F-017 | 2026-09-25 | 5 | The storefront was built with Medusa's auto-created default key (F-005), which sees **0** products, so product pages 404. | `GET /store/products` with that key → `count: 0` | Runbook check added; use the seed's Default Sales Channel key. **Root cause:** `seed-initial-data.ts` creates a second "Default Sales Channel" and a second "Default Publishable API Key" next to the ones Medusa made on first boot (F-005), so admin shows two of each with the same name, and the demo products sit only in the seed's channel. **Resolved on staging 2026-09-26:** storefront rebuilt with the seed's key (`pk_c26703b7c…`, count 4). **Follow-up:** make the seed reuse the existing default channel and key instead of creating duplicates. | Informational; seed follow-up needs a task |
| F-018 | 2026-09-26 | 5 (Dokploy) | The Swarm Health Check was empty on the staging backend and storefront, even though the runbook sets it. The cause of the first backend 502 (~14:07 UTC, 2026-09-25) is not proven; clearing the health check is the likely fix. | Operator checked both Swarm Settings; backend redeploy with the runbook JSON: 212/212 `/health` 200 (12:18 to 12:26 UTC), JSON kept after save | Backend and storefront health checks set and verified 2026-09-26. The runbook JSON is unchanged. | Informational |
| F-019 | 2026-09-26 | 5 (Dokploy) | The staging worker's Watch Paths box was empty, so it redeployed on a push that touched only `ecommerce/storefront/**` and docs. The backend (`ecommerce/backend/**`) and storefront (`ecommerce/storefront/**`) filtered correctly. | P0-19 step 2: PR #4 merge 12:56:14 UTC → worker restart 13:01:35, backend unchanged (12:21:34); operator read all three Watch Paths boxes | Worker set to `ecommerce/backend/**`; runbook section 3 now names the value and warns about an empty box. Re-test in P0-19 step 2. | Informational |
| F-001 | 2026-09-25 | 6.2, 10 (R-g) | Plan says 2.21.1 has "no admin roles". RBAC code exists behind the undocumented flag `MEDUSA_FF_RBAC` (default `false`); the end-to-end PR medusajs/medusa#15620 is still open. | `node_modules/@medusajs/medusa/dist/feature-flags/rbac.js`; `@medusajs/core-flows/dist/rbac/*` | Keep the `cashier` actor type (plan decision stands; the flag is undocumented). Re-evaluate when the docs publish RBAC. | Plan decision (no change) |
