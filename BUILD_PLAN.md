# Build Plan — Medusa Apps (Pre-Build)

> **Status: planning only. No application code has been written yet.**
> Baseline checked 2026-09-24: **Medusa 2.21.1**, **pnpm 12.6.0**, **Node 22 LTS**.
> Re-check these versions on the day Phase 0 starts.

Contents

1. Goals and hard requirements
2. Repository layout
3. Upstream compatibility strategy
4. App standard (identical in every folder)
5. Dokploy deployment plan
6. Scenario plans (Ecommerce, POS, Booking, Wholesale, Reseller, Marketplace)
7. **Recommended build order**
8. Update and release process
9. Verified technical notes (from a prototype spike)
10. Open decisions and risks

---

## 1. Goals and hard requirements

| # | Requirement | How this plan meets it |
|---|---|---|
| R1 | Use official Medusa source, never modify upstream, latest Medusa and pnpm | Medusa is consumed **only as published npm packages** (`@medusajs/*`). No fork, no git submodule, no `pnpm patch`, no edits inside `node_modules`. Customization only through official extension points (§3). |
| R2 | Always compatible with Medusa updates; deploy an update any time | Exact version pins, lockfile per app, a scripted update per app, a CI gate (build + typecheck + migrate + health check) before any deploy, and Dokploy rollback (§3, §8). |
| R3 | Dokploy-ready, **not a monorepo**, one folder per scenario, each with its own `Dockerfile` and env | Six independent folders. No root `package.json`, no workspace, no shared code. Each folder builds from its own folder as Docker context (§2, §5). |
| R4 | Each scenario has its own dependencies | Each folder has its own `package.json`, `pnpm-lock.yaml` and `node_modules`. |
| R5 | Side-by-side comparison in project root | `COMPARISON.md` |
| R6 | Pre-build plan with recommended build order in project root | This file, §7 |

**Honest limit on R2.** No repository can guarantee that *every* future Medusa release is non-breaking; Medusa occasionally ships breaking changes in minor versions (listed in its release notes), and database migrations are forward-only. What this plan guarantees is that **an update can never reach production without passing the CI gate**, that each app is updated independently, and that the previous working image can be redeployed. See §8.

---

## 2. Repository layout

```
medusa-apps/                  <- plain git repo, NOT a workspace
├── README.md
├── COMPARISON.md             <- side-by-side comparison (R5)
├── BUILD_PLAN.md             <- this file (R6)
├── .github/                  <- (Phase 0) CI matrix + dependabot, one entry per folder
├── scripts/                  <- (Phase 0) plain shell scripts, no package.json
│   ├── update-medusa.sh      <- update one app or all apps
│   └── verify.sh             <- the CI gate, runnable locally
├── ecommerce/                <- standalone Medusa app
├── pos/                      <- standalone Medusa app
├── booking-services/         <- standalone Medusa app
├── wholesale/                <- standalone Medusa app
├── reseller/                 <- standalone Medusa app
└── marketplace/              <- standalone Medusa app
```

Folder names are lowercase kebab-case (no spaces or capitals) because they become Dokploy build paths, Docker image names and database names.

**Rules that keep it "not a monorepo":**
- No root `package.json`, no `pnpm-workspace.yaml` at root, no shared `packages/` folder.
- No folder imports anything from another folder. Duplicated boilerplate is intentional; it is the price of independent deploys.
- Each folder can be copied out into its own repo and still build.

**Storefronts and client apps** (web storefront, vendor portal, seller portal, POS tablet app, buyer portal) are separate deployables. They will be added later as their own top-level folders under the same rules, e.g. `ecommerce-storefront/`, `pos-app/`, `marketplace-vendor-portal/`.

---

## 3. Upstream compatibility strategy

### 3.1 Allowed extension points (official, versioned APIs)

| Need | Use | Never |
|---|---|---|
| New data | Custom **module** (`src/modules/*`) with its own tables | Adding columns to core tables |
| Relate custom data to core data | **Module links** (`src/links/*`, `defineLink`) | Foreign keys into core tables |
| Business logic | **Workflows** + steps with compensation (`src/workflows/*`) | Overriding core services |
| Change core flows (add-to-cart, checkout) | **Workflow hooks** (`validate`, `productsCreated`, …) or a custom workflow that *calls* core workflows | Copying and editing core workflow code |
| React to events | **Subscribers** (`src/subscribers/*`) | Patching the event bus |
| Background tasks | **Scheduled jobs** (`src/jobs/*`) | External cron hitting internals |
| New endpoints | **API routes** (`src/api/*`) + middlewares | Monkey-patching core routes |
| Admin UI | **Admin widgets / UI routes** (`src/admin/*`) | Forking the dashboard |
| Infrastructure | Official modules configured in `medusa-config.ts` (Redis, S3, …) | Custom forks of infrastructure modules |

### 3.2 Version policy

- All `@medusajs/*` packages pinned to the **exact same version** (no `^`/`~`).
- `packageManager: "pnpm@<exact>"` in each `package.json`; the Dockerfile installs exactly that version.
- `pnpm install --frozen-lockfile` everywhere (local CI and Docker). A build never resolves new versions on its own.
- Only public imports: `@medusajs/framework/*`, `@medusajs/medusa/*`, `@medusajs/medusa/core-flows`, `@medusajs/admin-sdk`, `@medusajs/ui`. Never import from `dist/` paths.

### 3.3 Tests that protect updates

Every app keeps a small test suite that exercises its custom code against real Medusa (integration tests via `@medusajs/test-utils`). An update is accepted only if these pass (see §8).

---

## 4. App standard (identical in every folder)

```
<app>/
├── package.json              # own deps, exact @medusajs pins, packageManager
├── pnpm-lock.yaml            # own lockfile
├── pnpm-workspace.yaml       # pnpm SETTINGS for this app only (no `packages:` key)
├── medusa-config.ts          # env-driven; custom modules listed at the top
├── tsconfig.json             # from the official starter
├── jest.config.js            # from the official starter
├── instrumentation.ts        # from the official starter (OpenTelemetry, off)
├── Dockerfile                # multi-stage, standalone
├── docker-entrypoint.sh      # migrations + start, server/worker aware
├── .dockerignore
├── .gitignore
├── .env.example              # every variable documented
├── docker-compose.local.yml  # local Postgres + Redis + app (Dokploy ignores it)
├── README.md                 # what it is, how to run, how to deploy
├── integration-tests/
└── src/
    ├── modules/<scenario>/   # models, service, migrations
    ├── links/
    ├── workflows/
    ├── subscribers/
    ├── jobs/
    ├── api/
    ├── admin/
    └── scripts/              # seed scripts
```

Source of truth for the boilerplate: the official **`medusajs/medusa-starter-default`** repository (backend only; its yarn files are replaced by pnpm ones).

### 4.1 `pnpm-workspace.yaml` (per app)

pnpm ≥ 11 reads project settings from `pnpm-workspace.yaml` and **ignores the starter's `.npmrc` hoisting settings**. Without a `packages:` key this file only holds settings, so the app is still a single package.

```yaml
publicHoistPattern:          # required by the Medusa Admin build
  - "*@medusajs/*"
  - "@tanstack/react-query"
  - "react-i18next"
  - "react-router-dom"
allowBuilds:                 # pnpm blocks install scripts unless allowed
  "@medusajs/telemetry": false
  "@swc/core": true
  esbuild: true
  msgpackr-extract: true
  protobufjs: true
```

### 4.2 `medusa-config.ts` behaviour

| Env | Effect |
|---|---|
| `DATABASE_URL` | Postgres connection (one database per app) |
| `REDIS_URL` set | Enables official Redis modules: `cache-redis`, `event-bus-redis`, `workflow-engine-redis` (`{ redis: { redisUrl } }`), `locking` + `locking-redis`. Unset = in-memory (dev only). |
| `MEDUSA_WORKER_MODE` | `shared` (default), `server` (HTTP only) or `worker` (jobs/subscribers only) |
| `DISABLE_MEDUSA_ADMIN` | Disable the dashboard; forced off on workers |
| `MEDUSA_BACKEND_URL` | Admin backend URL; leave empty when admin is served by the same app |
| `S3_*` set | Enables `file` + `file-s3` provider (S3 / R2 / MinIO). Containers are ephemeral, so uploads must go to S3 in production. |
| `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `JWT_SECRET`, `COOKIE_SECRET` | Standard Medusa settings |

The newer Medusa **Caching module** is still behind a `[WIP]` feature flag in 2.21.x, so the stable `cache-redis` module is used until it graduates.

### 4.3 Dockerfile design

1. **Build stage** — `docker.io/library/node:22-bookworm-slim` (fully-qualified name so Podman/Buildah can build it too; multi-arch, so arm64 and amd64 build servers both work).
2. Copy `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`; install the pnpm version read from `packageManager`; `pnpm install --frozen-lockfile`.
3. Copy source; `pnpm build` (`medusa build` → `.medusa/server`, including the compiled admin).
4. In `.medusa/server`: copy in `pnpm-lock.yaml` + `pnpm-workspace.yaml` (the build does **not** copy the lockfile), then `pnpm install --prod --frozen-lockfile`.
5. **Runtime stage** — same base image, copy only `.medusa/server`, run as the `node` user, expose `9000`.
6. Entrypoint: `start` → run `medusa db:migrate` (only when `MEDUSA_WORKER_MODE` ≠ `worker` and `RUN_MIGRATIONS` ≠ `false`) → `medusa start`. Any other command is passed through (e.g. `medusa user -e … -p …` to create an admin).
7. Optional build arg `MEDUSA_BACKEND_URL` (baked into the admin bundle).

No `HEALTHCHECK` instruction (Podman ignores it in OCI format); health checks are configured in Dokploy against `GET /health`.

### 4.4 `.env.example` (base, every app)

```
NODE_ENV=production
PORT=9000
DATABASE_URL=postgres://user:pass@host:5432/<app>
REDIS_URL=redis://host:6379
JWT_SECRET=
COOKIE_SECRET=
STORE_CORS=
ADMIN_CORS=
AUTH_CORS=
MEDUSA_BACKEND_URL=
MEDUSA_WORKER_MODE=shared
DISABLE_MEDUSA_ADMIN=false
RUN_MIGRATIONS=true
S3_FILE_URL=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_REGION=
S3_BUCKET=
S3_ENDPOINT=
S3_FORCE_PATH_STYLE=false
```

Scenario-specific variables are listed in each scenario plan in §6.

---

## 5. Dokploy deployment plan

Per app you deploy (repeat per folder):

| Dokploy resource | Settings |
|---|---|
| **PostgreSQL** service | One database per app (e.g. `ecommerce`). Never share a database between apps. |
| **Redis** service | One per app (or one Redis with distinct DB indexes / key prefixes). |
| **Application — server** | Provider: Git (`medusa-apps` repo). **Build Path: `/<folder>`**. Build Type: **Dockerfile** (`Dockerfile`). Env: base vars + `MEDUSA_WORKER_MODE=server`. Domain → port 9000. Health check path `/health`. |
| **Application — worker** | Same repo / build path / image. Env: `MEDUSA_WORKER_MODE=worker`, `DISABLE_MEDUSA_ADMIN=true`, `RUN_MIGRATIONS=false`. No domain. |
| Watch paths (auto-deploy) | `/<folder>/**` only, so a change in `booking-services/` never redeploys `ecommerce/`. |

Small deployments can run a single `shared` instance instead of server + worker.

First deploy checklist per app: create DB and Redis → create server app → deploy (migrations run) → create admin user from the Dokploy terminal (`docker-entrypoint.sh medusa user -e … -p …`) → create worker app → set domain and CORS → run seed only for non-production.

---

## 6. Scenario plans

Each scenario lists: custom modules (tables are prefixed to avoid collisions), links, workflows / hooks, API routes, jobs / subscribers, admin extensions, client apps, env, and acceptance criteria. **MVP** = first release; **Later** = after launch.

### 6.1 Ecommerce — `ecommerce/`

- **Custom modules:** none. This is the reference app: pure Medusa core plus infrastructure config.
- **MVP:** regions, currencies, tax, shipping options; payment provider; notification provider (email); S3 files; seed script; storefront (official Next.js Starter in its own folder later).
- **Later:** search (Meilisearch / Algolia plugin), abandoned cart and restock alerts (Commerce Automation recipe), reviews.
- **Acceptance:** browse → cart → checkout → order visible in admin; update script and CI gate proven on this app first.

### 6.2 POS — `pos/`

- **Custom module `pos`:** `pos_register` (name, code, is_active), `pos_shift` (status open/closed, opened_by, closed_by, opened_at, closed_at, currency_code, opening_cash, counted_cash, expected_cash, notes).
- **Links:** register ↔ stock location (many → one), register ↔ sales channel (many → one), shift → orders (one → many).
- **Workflows:** `open-shift` (one open shift per register), `close-shift` (compute expected cash from cash payments, store variance), `pos-checkout` (calls core cart workflows, marks payment captured, links order to shift).
- **API routes:** `/admin/pos/registers`, `/admin/pos/shifts/open|close`, barcode lookup by SKU/EAN.
- **Admin:** shift report page (per register / per cashier / per day).
- **Client app (later folder `pos-app/`):** tablet or web app: login, barcode scan, cart, customer lookup, payment (cash / card / QR), receipt.
- **Env:** none extra at MVP.
- **Later:** offline queue in the POS app, click-and-collect, in-store returns of online orders.
- **Acceptance:** a sale at a register reduces stock at that shop's location only; a shift closes with a correct cash variance.

### 6.3 Booking services — `booking-services/`

- **Custom module `booking`:** `booking_resource` (name, type staff/room/equipment/venue, capacity, timezone, is_active), `booking_schedule` (weekday, start_time, end_time), `booking` (starts_at, ends_at in UTC, status pending/confirmed/cancelled/expired/completed/no_show, hold_expires_at, customer_id, cart_id, line_item_id, notes).
- **Links:** resource ↔ product variant (many ↔ many: which services a resource offers), booking → order (many → one).
- **Service methods:** `isSlotAvailable` (overlap + capacity; pending holds count only until they expire), `createHold`.
- **Hooks / workflows:** `addToCartWorkflow` `validate` hook → slot must be available; `add-booking-to-cart` workflow creates the hold and the line item together (compensation removes the hold); `completeCartWorkflow` `validate` hook re-checks the hold; subscriber `order.placed` → confirm bookings and link to order; `cancel-booking` workflow applies the cancellation policy and triggers the refund.
- **Jobs:** release expired holds (every minute); reminders 24 h before.
- **API routes:** `GET /store/booking/availability`, `GET /store/booking/slots` (free slots for service + date), `POST /store/booking/cancel`.
- **Admin:** day/week calendar per resource; walk-in booking.
- **Env:** `BOOKING_HOLD_MINUTES` (default 15), `BOOKING_DEFAULT_TIMEZONE`, `BOOKING_CANCEL_HOURS`.
- **Services are products with no shipping** (variants per duration / staff level).
- **Acceptance:** two customers cannot hold the same slot; an abandoned checkout frees the slot automatically; cancellation inside the policy refunds.

### 6.4 Wholesale — `wholesale/`

- **Custom module `company`:** `company` (name, contacts, tax_id, status, payment_terms prepaid/net_15/net_30/net_60, credit_limit, currency_code), `employee` (spending_limit, is_admin). **Later:** `quote`.
- **Links:** employee ↔ customer (one ↔ one), company ↔ customer group (the price tier).
- **Pricing:** core **price lists** with a customer-group rule per tier; quantity tiers via price rules.
- **Hooks / workflows:** `addToCartWorkflow` `validate` → minimum order quantity and approved company; `completeCartWorkflow` `validate` → employee spending limit and company credit limit; `request-quote` / `accept-quote` (via draft orders); approval flow for orders above a limit.
- **Payments:** manual "invoice / net terms" payment provider; invoice PDF.
- **API routes:** `/store/companies/me`, `/store/companies/me/employees`, `/store/quotes`.
- **Client app (later):** buyer portal: bulk add by SKU / CSV, reorder, invoices.
- **Env:** `WHOLESALE_REQUIRE_APPROVAL` (new companies need admin approval).
- **Optional:** ERP integration exactly as in the official ERP recipe.
- **Acceptance:** a Gold company sees Gold prices; an employee over their limit cannot complete checkout.

### 6.5 Reseller — `reseller/`

- **Custom module `seller`:** `seller` (handle, name, email, domain, status, commission_rate), `seller_commission` (order_id unique, order_total, rate, amount, currency_code, status pending/approved/paid/cancelled, paid_at). **Later:** `seller_payout`.
- **Links:** seller ↔ sales channel (one ↔ one — the seller's storefront publishable key).
- **Workflows:** `record-seller-commission` (order → sales channel → seller → commission; idempotent; ignores channels without an active seller), triggered by subscriber `order.placed`; `cancel-commission` on order cancel / refund; monthly payout batch.
- **Seller auth:** custom actor type `seller` (auth identity), seller-scoped routes under `/sellers/*`.
- **API routes:** `/sellers/me`, `/sellers/me/products` (choose which of your products appear in their channel), `/sellers/me/commissions`.
- **Client apps (later):** multi-tenant storefront that picks the publishable key by domain; seller portal.
- **Env:** `RESELLER_DEFAULT_COMMISSION_RATE`, `RESELLER_PAYOUT_DAY`.
- **Acceptance:** an order in a seller's channel creates exactly one commission, even if the event is delivered twice; orders from your own channel create none.

### 6.6 Marketplace — `marketplace/`

- **Custom module `marketplace`:** `vendor` (handle, name, email, logo, status, commission_rate), `vendor_admin` (email, names), `vendor_payout` (amount, currency, status, period, paid_at, reference).
- **Links:** vendor → products, vendor → orders (child orders), vendor → stock locations.
- **Vendor auth:** custom actor type `vendor`; signup → admin approval; vendor-scoped routes under `/vendors/*` (every query filtered by the logged-in vendor).
- **Workflows:** `create-vendor`, `create-vendor-product` (links product to vendor, status draft until approved), **`split-order-by-vendor`** on `order.placed` (parent order + one child order per vendor, with compensation), `record-vendor-commission`, `create-payouts` (scheduled).
- **Admin:** vendor approval queue, product moderation, payout report.
- **Client apps (later):** vendor portal (products, orders, fulfillments, payouts); marketplace storefront.
- **Env:** `MARKETPLACE_DEFAULT_COMMISSION_RATE`, `MARKETPLACE_REQUIRE_PRODUCT_APPROVAL`, `MARKETPLACE_PAYOUT_DAY`.
- **Payouts:** start with manual payouts from a report; automate only if the payment provider supports split payments.
- **Acceptance:** a cart with items from two vendors produces two child orders that each vendor sees and fulfills separately; payouts equal order totals minus commission.

---

## 7. Recommended build order

| Phase | Deliverable | Size | Depends on | Why this position |
|---|---|---|---|---|
| **0. Foundation** | Repo standards (§4) in all six folders as empty-but-working Medusa apps; `scripts/update-medusa.sh`, `scripts/verify.sh`; CI matrix; one app deployed to Dokploy end-to-end (server + worker) | M | — | Proves R1–R4 before any business logic exists. Everything later reuses it. |
| **1. Ecommerce** | `ecommerce/` MVP + storefront folder | S | 0 | The core every other scenario builds on. Fastest path to a live, earning app. |
| **2. POS** | `pos/` MVP + `pos-app/` | M | 1 | Reuses all of Ecommerce; adds registers, shifts and a client app. |
| **3. Booking services** | `booking-services/` MVP + booking storefront pages | M–L | 1 | First scenario that needs hooks on core cart flows; hold/expiry logic must be solid. |
| **4. Wholesale** | `wholesale/` MVP + buyer portal | M | 1 | Mostly core price lists + a small module + checkout validation hooks. |
| **5. Reseller** | `reseller/` MVP + seller portal + multi-tenant storefront | M–L | 1, 4 | Introduces a second actor type and money owed to partners. Learnings from 4 (company/actor patterns) carry over. |
| **6. Marketplace** | `marketplace/` MVP + vendor portal | L | 1, 5 | Hardest: vendor actor, order splitting, payouts, moderation. Built last so actor-type and commission patterns are already proven in 5. |

Rules for the order:

- **Phases 2–4 may be reordered by business priority** (build first whichever earns first). Phases 0 and 1 always come first; Phase 6 always comes after Phase 5.
- **Each phase ends with:** CI gate green, deployed to Dokploy staging, one successful Medusa update performed with `scripts/update-medusa.sh` on that app.
- **Do not start two "L" phases at the same time.**

---

## 8. Update and release process

```
scripts/update-medusa.sh <app|all> [version]   # default: latest
```

Per app, the script will:

1. Read the target version (`npm view @medusajs/medusa version` when not given).
2. Set **every** `@medusajs/*` dependency to that exact version; optionally bump `packageManager` to the latest pnpm.
3. `pnpm install` → new `pnpm-lock.yaml`.
4. Run `scripts/verify.sh <app>`:
   - `pnpm build` then `pnpm typecheck`
   - integration tests
   - fresh Postgres: `medusa db:migrate`, start, `GET /health` = 200, `GET /app` = 200
   - upgrade path: restore a copy of the previous version's database, migrate, start, health check
5. On success: commit `package.json` + `pnpm-lock.yaml` for that app only.

Release:

1. Read the Medusa release notes for every version skipped (breaking changes are called out there).
2. **Back up the app's database** (migrations cannot be rolled back automatically).
3. Deploy to staging via Dokploy, smoke test, then production.
4. Rollback = redeploy the previous commit / image **and restore the backup if the new version ran migrations**.

Automation (Phase 0): Dependabot (or Renovate) configured **per folder**, grouping all `@medusajs/*` packages into one PR per app; CI runs the verify gate on each PR; merging deploys only that folder (Dokploy watch paths).

---

## 9. Verified technical notes (from a prototype spike)

A throwaway prototype was built on Medusa 2.21.1 + pnpm 12.6.0 to test this plan. The code was not kept (this repo is plan-only), but these findings are confirmed and must be followed in Phase 0:

| Topic | Finding |
|---|---|
| pnpm 12 + `.npmrc` | The starter's `public-hoist-pattern` lines in `.npmrc` are **ignored**. Put `publicHoistPattern` in the app's `pnpm-workspace.yaml`. |
| pnpm 12 install scripts | Install fails with `ERR_PNPM_IGNORED_BUILDS` until `allowBuilds` is set (`@swc/core`, `esbuild`, `msgpackr-extract`, `protobufjs`; telemetry can be `false`). |
| `medusa build` output | `.medusa/server` contains `package.json` but **no lockfile**; copy `pnpm-lock.yaml` + `pnpm-workspace.yaml` in before `pnpm install --prod --frozen-lockfile`. |
| Typecheck | `tsc --noEmit` needs `.medusa/types`, which the build generates; run build before typecheck in CI. |
| Migrations | `medusa db:generate <module>` needs a reachable database. Commit both the migration file and the `.snapshot-*.json`. |
| Linkable names | `Module.linkable.<camelCase of model name>`: model `booking_resource` → `linkable.bookingResource`, `pos_register` → `linkable.posRegister`. |
| Service method names | Generated from the **object keys** passed to `MedusaService({...})`: key `Resource` → `createResources`, not the table name. |
| Workflows | Returning the result of `when(...).then(...)` directly in `WorkflowResponse` fails typecheck; wrap it: `new WorkflowResponse({ result })`. |
| Link queries | Reading a linked record through `useQueryGraphStep` (e.g. `sales_channel` → `seller.*`) works in a workflow. |
| Redis modules | Workflow engine option shape is `{ redis: { redisUrl } }` (`url` is deprecated). Caching module is still `[WIP]` behind a feature flag → use `cache-redis`. |
| S3 provider options | `file_url`, `access_key_id`, `secret_access_key`, `region`, `bucket`, `endpoint`, `additional_client_config` (e.g. `forcePathStyle` for MinIO). |
| Runtime check | Production build (server + Redis) started cleanly; `/health` and `/app` returned 200 for all six app shapes; booking hold / double-booking / hold-expiry and reseller commission idempotency behaved as designed. |

---

## 10. Open decisions and risks

| # | Decision / risk | Needed by |
|---|---|---|
| D1 | Payment providers per app (card, QR, cash on delivery, net terms) and whether any supports split payments for vendors / sellers | Phase 1 |
| D2 | Notification channels (email, SMS, messaging apps) | Phase 1 |
| D3 | File storage provider (S3, R2, MinIO on your own server) | Phase 0 |
| D4 | Storefront technology (official Next.js Starter vs custom) | Phase 1 |
| D5 | POS app platform (web / PWA vs React Native) and whether offline mode is required | Phase 2 |
| D6 | Staging environment in Dokploy (separate project, separate databases) | Phase 0 |
| R-a | Medusa minor release with a breaking change → caught by CI gate; may need code changes before updating | ongoing |
| R-b | Migration applied then rollback needed → requires DB backup restore | every release |
| R-c | Duplicated boilerplate drifts between folders → Phase 0 `verify.sh` also diffs the standard files across folders | ongoing |
