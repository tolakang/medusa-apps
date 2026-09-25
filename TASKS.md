# Development Task List

> Built from `BUILD_PLAN.md` (frozen). Work through it with `DEV_FLOW.md`, using `MEDUSA_SKILL.md` as the only Medusa reference.
> **This file is the living tracker.** Update it at the end of every task (DEV_FLOW §8). Never edit `BUILD_PLAN.md`.

**Legend:** `[ ]` to do · `[~]` in progress · `[x]` done (`— done: <sha>, tests: <n>, refs: <…>`) · `[!]` blocked (`— blocked: <error>, evidence: <…>`)

**Order rules** (plan §7): Phases 0 and 1 first. Phases 2–4 may be reordered by business priority. Phase 6 comes after Phase 5. Don't run two "L" phases at once. Inside a phase: backend → storefront → portal/app.

| Phase | Category | Size | Status |
|---|---|---|---|
| 0 | Foundation (in `ecommerce/`) | M | Not started |
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
- [ ] P0-01 Re-check Medusa, pnpm and Node versions on the start day (MEDUSA_SKILL §1). If they changed, refresh the skill (§14) and log it. Don't edit the plan.
- [ ] P0-02 Decide **D3** file storage (S3 / R2 / MinIO) and **D6** staging setup. Record them in the Decisions log below.

**Backend standard (`ecommerce/backend`) · plan §4.1**
- [ ] P0-03 Copy `apps/backend` from `medusajs/dtc-starter` at the version-matching commit. Record the commit in `ecommerce/backend/README.md`. Rename the package.
- [ ] P0-04 Set up pnpm: `packageManager: pnpm@<exact>`; `pnpm-workspace.yaml` with `publicHoistPattern` + `allowBuilds` (no `packages:` key); exact `@medusajs/*` pins (`@medusajs/ui` on its own line).
- [ ] P0-05 Add the scripts `predeploy` (`medusa db:migrate`), `typecheck` (`tsc --noEmit`) and the three test scripts (MEDUSA_SKILL §10).
- [ ] P0-06 Write an env-driven `medusa-config.ts` per plan §4.1 and MEDUSA_SKILL §2: `redisUrl`, conditional Redis modules (caching + `@medusajs/caching-redis`, event-bus, workflow-engine, locking), `MEDUSA_FF_CACHING`, conditional S3, `workerMode`, `admin.disable`/`backendUrl`.
- [ ] P0-07 Gate 1 green (install, build, typecheck).
- [ ] P0-08 Keep the committed `Dockerfile`, `docker-entrypoint.sh` (safe migrate flags) and `.env.example`. Adjust only if evidence requires it, and log it.
- [ ] P0-09 Gate 2 + Gate 4: image builds. Server container: migrations run, `/health` 200, `/app` 200. Worker container starts with admin disabled and no migrations.

**Web client standard (`ecommerce/storefront`) · plan §4.2**
- [ ] P0-10 Copy `apps/storefront` from `dtc-starter` and record the commit. Apply starter changes 1–5 (6 optional, decide and log).
- [ ] P0-11 `pnpm build` succeeds with the backend **down** (static-params guards). The image builds and serves on 8000.

**Tooling · plan §4.3, §8**
- [ ] P0-12 `docker-compose.local.yml` (Postgres + Redis + backend + storefront).
- [ ] P0-13 `scripts/verify.sh <category>` = DEV_FLOW Gates 1–4 (fresh DB and upgrade-path DB).
- [ ] P0-14 `scripts/guard.sh` = DEV_FLOW Gate 5, including "BUILD_PLAN.md unchanged".
- [ ] P0-15 `scripts/update-medusa.sh <category|category/app|all> [version]` per plan §8.
- [ ] P0-16 Integration-test skeleton: one `integration-tests/http` test and one module test, running with a Postgres service.
- [ ] P0-17 CI matrix: one job per deployable running verify + guard. Dependabot/Renovate per folder, grouping `@medusajs/*` per category.

**Deploy · plan §5**
- [ ] P0-18 Dokploy staging project: Postgres, Redis, backend server, worker, storefront. Build paths, watch paths, health check `/health`, first-deploy order.
- [ ] P0-19 Independence proof: redeploy each app alone, then roll one back.
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

## Decisions log (plan §10)

| ID | Decision | Needed by | Choice | Date | Evidence / reason |
|---|---|---|---|---|---|
| D1 | Payment providers per project; split payments? | Phase 1 | | | |
| D2 | Notification channels | Phase 1 | | | |
| D3 | File storage provider | Phase 0 | | | |
| D4 | Storefront design (starter look vs restyle) | Phase 1 | | | |
| D5 | POS app: PWA vs native | Phase 2 | | | |
| D6 | Staging environment in Dokploy | Phase 0 | | | |

## Plan deviations & findings log

Record anything where verified evidence differs from or adds to `BUILD_PLAN.md`. The plan itself is **not** edited.

| # | Date | Plan § | Finding | Evidence | Action | Approved by |
|---|---|---|---|---|---|---|
| F-001 | 2026-09-25 | 6.2, 10 (R-g) | Plan says 2.21.1 has "no admin roles". RBAC code exists behind the undocumented flag `MEDUSA_FF_RBAC` (default `false`); the end-to-end PR medusajs/medusa#15620 is still open. | `node_modules/@medusajs/medusa/dist/feature-flags/rbac.js`; `@medusajs/core-flows/dist/rbac/*` | Keep the `cashier` actor type (plan decision stands; the flag is undocumented). Re-evaluate when the docs publish RBAC. | Plan decision (no change) |
