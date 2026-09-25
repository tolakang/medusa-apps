# Build Plan — Medusa Apps (Pre-Build)

> **Status: planning only. No application code has been written yet.** Deployment templates are committed: every deployable folder already has its `Dockerfile` and `.env.example`, and every category has a Dokploy guide in `<category>/README.md`.
> Baseline checked 2026-09-25: **Medusa 2.21.1**, **pnpm 12.6.0**, **Node 22 LTS**.
> Re-check these versions on the day Phase 0 starts.
>
> **Revision 3 (2026-09-25):** audited against the official Medusa v2 docs (docs.medusajs.com) and starters. Changes: starters moved to `medusajs/dtc-starter` (the standalone backend and Next.js starters are deprecated); Caching Module replaces the deprecated `cache-redis`; `projectConfig.redisUrl` added; storefront backend URL is `NEXT_PUBLIC_MEDUSA_BACKEND_URL`; `@medusajs/ui` has its own version line; marketplace order split, POS order creation and booking validation aligned with the official recipes / workflow reference. Changed sections: 3.2, 4.1, 4.2, 6.2, 6.3, 6.4, 6.5, 6.6, 8, 9, 10.
>
> **Revision 2 (2026-09-24):** every category folder is now a complete business project with one sub-folder per deployable (`backend/`, `storefront/`, and a portal or app where needed). Each deployable has its own `Dockerfile` and `.env.example` (committed as ready templates). Changed sections: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.

Contents

1. Goals and hard requirements
2. Repository layout
3. Upstream compatibility strategy
4. Deployable standards (backend, web client)
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
| R1 | Use official Medusa source, never modify upstream, latest Medusa and pnpm | Medusa is consumed **only as published npm packages** (`@medusajs/*`). No fork, no git submodule, no `pnpm patch`, no edits inside `node_modules`. Customization only through official extension points (§3). Boilerplate is copied from the official **`medusajs/dtc-starter`** (§4). |
| R2 | Always compatible with Medusa updates; deploy an update any time | Exact version pins, lockfile per deployable, a scripted update per category, a CI gate (build + typecheck + migrate + health check) before any deploy, and Dokploy rollback (§3, §8). |
| R3 | Dokploy-ready, **not a monorepo**, one folder per scenario; each folder holds the backend **and** storefront (and portal/app) with their own `Dockerfile` and env; every deployment works independently | Six category folders; inside each, one sub-folder per deployable with its own `Dockerfile`, `.env.example` and (in the build phase) its own `package.json` + lockfile. No root `package.json`, no workspace, no shared code. Each sub-folder is its own Docker context and Dokploy Build Path (§2, §5). |
| R4 | Each scenario has its own dependencies | Each deployable sub-folder has its own `package.json`, `pnpm-lock.yaml` and `node_modules`; nothing is shared between sub-folders or categories. |
| R5 | Side-by-side comparison in project root | `COMPARISON.md` |
| R6 | Pre-build plan with recommended build order in project root | This file, §7 |

**Honest limit on R2.** Backends and storefronts start from the official `dtc-starter`, which is a *template you copy*, not a package; its upstream changes are merged by hand (§8.1). Their `@medusajs/*` packages are pinned like the backend's. No repository can guarantee that *every* future Medusa release is non-breaking; Medusa occasionally ships breaking changes in minor versions (listed in its release notes), and database migrations are forward-only. What this plan guarantees is that **an update can never reach production without passing the CI gate**, that each category (and each deployable in it) is updated and deployed independently, and that the previous working image can be redeployed. See §8.

---

## 2. Repository layout

```
medusa-apps/                        <- plain git repo, NOT a workspace
├── README.md
├── COMPARISON.md                   <- side-by-side comparison (R5)
├── BUILD_PLAN.md                   <- this file (R6)
├── .github/                        <- (Phase 0) CI matrix + dependabot, one entry per deployable
├── scripts/                        <- (Phase 0) plain shell scripts, no package.json
│   ├── update-medusa.sh
│   └── verify.sh
│
├── ecommerce/                      <- one business project = one Dokploy project
│   ├── README.md                   <- Dokploy guide for this project
│   ├── backend/                    <- Medusa (server + worker)   Dockerfile, .env.example
│   └── storefront/                 <- Next.js shop               Dockerfile, .env.example
├── pos/
│   ├── backend/
│   ├── storefront/
│   └── pos-app/                    <- Next.js PWA for the counter
├── booking-services/
│   ├── backend/
│   └── storefront/                 <- shop + booking pages
├── wholesale/
│   ├── backend/
│   └── storefront/                 <- B2B buyer shop (login required)
├── reseller/
│   ├── backend/
│   ├── storefront/                 <- multi-tenant, one site per seller domain
│   └── seller-portal/
└── marketplace/
    ├── backend/
    ├── storefront/
    └── vendor-portal/
```

| Category | Deployables (each = its own Dockerfile + env + Dokploy app) |
|---|---|
| ecommerce | backend (+ worker), storefront |
| pos | backend (+ worker), storefront, pos-app |
| booking-services | backend (+ worker), storefront |
| wholesale | backend (+ worker), storefront |
| reseller | backend (+ worker), storefront, seller-portal |
| marketplace | backend (+ worker), storefront, vendor-portal |

Names are lowercase kebab-case because they become Dokploy build paths, image names and database names.

**Rules that keep it "not a monorepo" and keep deployments independent:**
- No root `package.json`, no root `pnpm-workspace.yaml`, no shared `packages/` folder.
- No sub-folder imports anything from another sub-folder or category. Clients talk to their backend **only over HTTP**.
- Duplicated boilerplate is intentional; it is the price of independent deploys.
- Any sub-folder can be copied into its own repo and still build.
- The backend image is deployed twice per project (server + worker); everything else once.
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

- All `@medusajs/*` packages that follow the Medusa release line pinned to the **exact same version** (no `^`/`~`). Exception: **`@medusajs/ui` has its own version line** (4.x while Medusa is 2.21.1); pin it to the exact version the official `dtc-starter` uses for that Medusa release.
- `packageManager: "pnpm@<exact>"` in each `package.json`; the Dockerfile installs exactly that version.
- `pnpm install --frozen-lockfile` everywhere (local CI and Docker). A build never resolves new versions on its own.
- Only public imports: `@medusajs/framework/*`, `@medusajs/medusa/*`, `@medusajs/medusa/core-flows`, `@medusajs/admin-sdk`, `@medusajs/ui`. Never import from `dist/` paths.

### 3.3 Tests that protect updates

Every backend keeps a small test suite that exercises its custom code against real Medusa (integration tests via `@medusajs/test-utils`); every client must at least build against the updated backend. An update is accepted only if these pass (see §8).

---

## 4. Deployable standards

Two standards: **4.1 backend** (identical in every `*/backend`) and **4.2 web client** (every `storefront`, `*-portal`, `pos-app`). The `Dockerfile`, `docker-entrypoint.sh`, `.dockerignore` and `.env.example` of each are already committed as templates.

### 4.1 Backend standard (`<category>/backend/`)

```
<category>/backend/
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

Source of truth for the boilerplate: **`apps/backend`** of the official **`medusajs/dtc-starter`** repository (the older `medusa-starter-default` is deprecated). The DTC starter is a pnpm + Turborepo monorepo; only `apps/backend` is copied, and the workspace-level settings are moved into this app's own `pnpm-workspace.yaml`. Record the starter commit in the backend README. Add a `predeploy` script (`medusa db:migrate`) and a `typecheck` script; the starter ships neither.

#### `pnpm-workspace.yaml` (per deployable)

The official [pnpm guide](https://docs.medusajs.com/learn/configurations/pnpm) puts the four `public-hoist-pattern` entries in `.npmrc`; pnpm ≥ 11 no longer reads them there, so the same entries go into `pnpm-workspace.yaml` as `publicHoistPattern` (same packages, same intent as the docs). Without a `packages:` key this file only holds settings, so the app is still a single package.

```yaml
publicHoistPattern:          # required by the Medusa Admin build
  - "*@medusajs/*"
  - "@tanstack/react-query"
  - "react-i18next"
  - "react-router-dom"
allowBuilds:                 # pnpm blocks install scripts unless allowed
  "@medusajs/telemetry": false   # dtc-starter uses true; false = opt out of telemetry
  "@swc/core": true
  esbuild: true
  msgpackr-extract: true
  protobufjs: true
```

#### `medusa-config.ts` behaviour

| Env | Effect |
|---|---|
| `DATABASE_URL` | Postgres connection (one database per business project) |
| `REDIS_URL` set | Sets `projectConfig.redisUrl` (session store) and enables the modules from the official [deployment guide](https://docs.medusajs.com/learn/deployment/general): `caching` + provider `@medusajs/caching-redis` (separate npm package), `event-bus-redis`, `workflow-engine-redis` (`{ redis: { redisUrl } }`), `locking` + provider `locking-redis`. One Redis URL is used for all of them. Unset = in-memory (dev only). |
| `MEDUSA_FF_CACHING` | `true`. The Caching Module is still behind this feature flag in 2.21.x but is what the deployment guide configures; the old `cache-redis` module is deprecated since v2.11.0. |
| `MEDUSA_WORKER_MODE` | `projectConfig.workerMode`: `shared` (default), `server` (HTTP only) or `worker` (jobs/subscribers only) |
| `DISABLE_MEDUSA_ADMIN` | `admin.disable`; `true` on workers |
| `MEDUSA_BACKEND_URL` | `admin.backendUrl`; leave empty when admin is served by the same app |
| `S3_*` set | Enables `file` + `file-s3` provider (S3 / R2 / MinIO). Containers are ephemeral, so uploads must go to S3 in production. |
| `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `JWT_SECRET`, `COOKIE_SECRET` | Standard Medusa settings |

Variable names match the official deployment guide (`MEDUSA_WORKER_MODE`, `DISABLE_MEDUSA_ADMIN`, `MEDUSA_BACKEND_URL`). Migrations run only on the server instance, like the guide's `predeploy` step; the worker never migrates.

#### Backend Dockerfile design

1. **Build stage** — `docker.io/library/node:22-bookworm-slim` (fully-qualified name so Podman/Buildah can build it too; multi-arch, so arm64 and amd64 build servers both work).
2. Copy `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`; install the pnpm version read from `packageManager`; `pnpm install --frozen-lockfile`.
3. Copy source; `pnpm build` (`medusa build` → `.medusa/server`, including the compiled admin).
4. In `.medusa/server`: copy in `pnpm-lock.yaml` + `pnpm-workspace.yaml` (the build does **not** copy the lockfile), then `pnpm install --prod --frozen-lockfile`.
5. **Runtime stage** — same base image, copy only `.medusa/server`, run as the `node` user, expose `9000`.
6. Entrypoint: `start` → run `medusa db:migrate` (only when `MEDUSA_WORKER_MODE` ≠ `worker` and `RUN_MIGRATIONS` ≠ `false`) → `medusa start`. Any other command is passed through (e.g. `medusa user -e … -p …` to create an admin).
7. Optional build arg `MEDUSA_BACKEND_URL` (baked into the admin bundle).

No `HEALTHCHECK` instruction (Podman ignores it in OCI format); health checks are configured in Dokploy against `GET /health`.

#### `.env.example`

Committed per category (`<category>/backend/.env.example`), including CORS entries for that category's clients and its scenario settings. Base keys:

```
NODE_ENV=production
PORT=9000
DATABASE_URL=postgres://user:pass@host:5432/<category>
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
MEDUSA_FF_CACHING=true
```

Scenario-specific variables are listed in each scenario plan in §6.

---


### 4.2 Web client standard (`storefront/`, `*-portal/`, `pos-app/`)

```
<category>/<client>/
├── package.json          # own deps; @medusajs/js-sdk, icons, types, ui-preset pinned to the backend's version
├── pnpm-lock.yaml
├── pnpm-workspace.yaml   # settings only (allowBuilds for sharp, etc.)
├── next.config.js        # MUST set output: "standalone"
├── Dockerfile            # committed template
├── .dockerignore         # committed template
├── .env.example          # committed template: build-time args + runtime vars
├── README.md
└── src/
```

- **Framework:** Next.js for every web client (one Dockerfile pattern). Storefronts start from **`apps/storefront`** of the official **`medusajs/dtc-starter`** (since Medusa v2.14 the standalone `nextjs-starter-medusa` is deprecated and archived); portals and the POS app start from a plain Next.js app using `@medusajs/js-sdk`.
- **Starter changes required** (the storefront is a workspace package of the DTC monorepo, already on pnpm and pinned to the Medusa version):
  1. Give it its own `packageManager`, `pnpm-lock.yaml` and settings-only `pnpm-workspace.yaml`; carry over the root `pnpm.overrides` (`@types/react`, `@types/react-dom`) from the DTC root `package.json`. Keep `@medusajs/js-sdk`, `@medusajs/icons`, `@medusajs/types`, `@medusajs/ui-preset`, `@medusajs/instantsearch-adapter` on the exact backend version.
  2. Rename the package (`@dtc/storefront` → `<category>-storefront`).
  3. Add `output: "standalone"` to `next.config.js`.
  4. Image domains: the starter reads `MEDUSA_CLOUD_S3_HOSTNAME` / `MEDUSA_CLOUD_S3_PATHNAME`; change these two reads to `S3_IMAGE_HOSTNAME` / `S3_IMAGE_PATHNAME` so any bucket (S3, R2, MinIO) works.
  5. **Make the build independent of the backend:** the starter's `generateStaticParams` (products, collections, categories) calls the backend during `next build`, and the categories one fails the build if the backend is unreachable. Wrap each in a guard that returns `[]` on error, so pages render on demand instead. The build then only needs the publishable key.
  6. *(Optional)* **Internal backend URL on the server:** the starter's `src/lib/config.ts` uses `NEXT_PUBLIC_MEDUSA_BACKEND_URL` for both browser and server. Change it to prefer a server-only `MEDUSA_BACKEND_URL` when `typeof window === "undefined"`, so server-side calls use the private Dokploy hostname. Without this change the runtime `MEDUSA_BACKEND_URL` is unused.
- **Dockerfile design:** same fully-qualified multi-arch base image as the backend; `pnpm install --frozen-lockfile`; `pnpm build`; runtime stage copies only `.next/standalone`, `.next/static`, `public`; runs `node server.js` as `node` user. Storefront port 8000, portals / POS app 3000.
- **Env split:** `NEXT_PUBLIC_*` (and anything read by `next.config.js`) = **Dokploy Build-time Arguments** (declared as `ARG` in the Dockerfile); secrets and server-side URLs = **runtime variables**. Build-time URLs must be public; runtime `MEDUSA_BACKEND_URL` can be the internal Dokploy hostname (after change 6).

| Client | Build-time args | Runtime vars |
|---|---|---|
| storefront | `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (public), `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DEFAULT_REGION`, `NEXT_PUBLIC_STRIPE_KEY`, `S3_IMAGE_HOSTNAME`, `S3_IMAGE_PATHNAME` (+ scenario args) | `MEDUSA_BACKEND_URL`, `REVALIDATE_SECRET` (+ scenario vars) |
| vendor-portal / seller-portal / pos-app | `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_BASE_URL` | `MEDUSA_BACKEND_URL`, `COOKIE_SECRET` |

### 4.3 Local testing

Phase 0 adds a `docker-compose.local.yml` per category (Postgres + Redis + backend + clients) for running the whole business locally. Dokploy ignores it.
## 5. Dokploy deployment plan

**One category folder = one Dokploy project.** Each category README (`<category>/README.md`) has the exact service table and first-deploy order for that project.

| Dokploy resource | Settings |
|---|---|
| **PostgreSQL** | One per project. Never share a database between projects. |
| **Redis** | One per project. |
| **backend (server)** | Git provider → `medusa-apps`. **Build Path `/<category>/backend`**. Build Type **Dockerfile**. Env from `backend/.env.example` with `MEDUSA_WORKER_MODE=server`. Domain → 9000. Health check `/health`. |
| **backend (worker)** | Same Build Path and image. Env adds `MEDUSA_WORKER_MODE=worker`, `DISABLE_MEDUSA_ADMIN=true`, `RUN_MIGRATIONS=false`. No domain. |
| **storefront** | **Build Path `/<category>/storefront`**. Build-time Arguments + runtime env from `storefront/.env.example`. Domain → 8000. |
| **portal / pos-app** | **Build Path `/<category>/<client>`**. Env from its `.env.example`. Domain → 3000. |
| **Watch paths** | Each app watches only `/<category>/<app>/**`. A storefront change never rebuilds the backend, and nothing in `marketplace/` touches `pos/`. |

Small projects may run one `shared` backend instance instead of server + worker.

**First deploy of a project:** Postgres + Redis → backend server (migrations run) → admin user from the Dokploy terminal (`docker-entrypoint.sh medusa user -e … -p …`) → region, sales channel, publishable key in the admin → worker → storefront (key as build arg) → portal / app → final domains into backend CORS → redeploy backend.

**Afterwards** every app is redeployed, rebuilt or rolled back on its own. The only cross-app coupling is configuration: client URLs in backend CORS, and backend URL + publishable key in clients.

**Same template, many businesses:** a second marketplace business is a second Dokploy project using the same Build Paths with its own databases, domains and env.
## 6. Scenario plans

Each scenario lists: custom modules (tables are prefixed to avoid collisions), links, workflows / hooks, API routes, jobs / subscribers, admin extensions, client apps, env, and acceptance criteria. **MVP** = first release; **Later** = after launch.

### 6.1 Ecommerce — `ecommerce/`

- **Custom modules:** none. This is the reference app: pure Medusa core plus infrastructure config.
- **MVP:** regions, currencies, tax, shipping options; payment provider; notification provider (email); S3 files; seed script; `ecommerce/storefront` (from the official Next.js starter, §4.2).
- **Later:** search (Meilisearch / Algolia plugin), abandoned cart and restock alerts (Commerce Automation recipe), reviews.
- **Acceptance:** browse → cart → checkout → order visible in admin; update script and CI gate proven on this app first.

### 6.2 POS — `pos/`

- **Custom module `pos`:** `pos_register` (name, code, is_active), `pos_shift` (status open/closed, opened_by, closed_by, opened_at, closed_at, currency_code, opening_cash, counted_cash, expected_cash, notes).
- **Links:** register ↔ stock location (many → one), register ↔ sales channel (many → one), shift → orders (one → many).
- **Workflows:** `open-shift` (one open shift per register), `close-shift` (compute expected cash from cash payments, store variance), `pos-checkout` — follows the official POS recipe: creates the sale as a **draft order** in the POS sales channel (core draft-order workflows; the `@medusajs/draft-order` plugin ships with the starter), applies promotions, records payment, converts it to an order and links the order to the shift.
- **API routes:** `/admin/pos/registers`, `/admin/pos/shifts/open|close`, barcode lookup on the variant's `barcode` / `ean` / `upc` / `sku` fields (recipe: custom route).
- **Admin:** shift report page (per register / per cashier / per day).
- **Client apps:** `pos/storefront` (online shop on the same stock) and `pos/pos-app` (Next.js PWA for tablets): login, barcode scan, cart, customer lookup, payment (cash / card / QR), receipt.
- **Env:** none extra at MVP. `ADMIN_CORS` includes the POS app domain (the POS app uses the admin API with a cashier user).
- **Card payments:** the recipe suggests a terminal provider (e.g. Stripe Terminal) as a payment provider; decided under D1.
- **Later:** offline queue in the POS app, click-and-collect, in-store returns of online orders.
- **Acceptance:** a sale at a register reduces stock at that shop's location only; a shift closes with a correct cash variance.

### 6.3 Booking services — `booking-services/`

- **Custom module `booking`:** `booking_resource` (name, type staff/room/equipment/venue, capacity, timezone, is_active), `booking_schedule` (weekday, start_time, end_time), `booking` (starts_at, ends_at in UTC, status pending/confirmed/cancelled/expired/completed/no_show, hold_expires_at, customer_id, cart_id, line_item_id, notes).
- **Links:** resource ↔ product variant (many ↔ many: which services a resource offers), booking → order (many → one).
- **Service methods:** `isSlotAvailable` (overlap + capacity; pending holds count only until they expire), `createHold`.
- **Hooks / workflows:** `addToCartWorkflow` `validate` hook → slot must be available; `add-booking-to-cart` workflow creates the hold and the line item together (compensation removes the hold); `completeCartWorkflow` `validate` hook re-checks the hold — read-only (the reference forbids mutating the cart in this hook) and a hold owned by the same cart counts as valid, so a retried completion stays idempotent; subscriber `order.placed` → confirm bookings and link to order; `cancel-booking` workflow applies the cancellation policy and triggers the refund.
- **Jobs:** release expired holds (every minute); reminders 24 h before.
- **API routes:** `GET /store/booking/availability`, `GET /store/booking/slots` (free slots for service + date), `POST /store/booking/cancel`.
- **Admin:** day/week calendar per resource; walk-in booking.
- **Client app:** `booking-services/storefront` — starter + service pages, slot picker, booking management in the customer account.
- **Env:** `BOOKING_HOLD_MINUTES` (default 15), `BOOKING_DEFAULT_TIMEZONE`, `BOOKING_CANCEL_HOURS`.
- **Services are products with no shipping** (variants per duration / staff level; shipping disabled on the variants, as in the Ticket Booking recipe).
- **Tickets / fixed-capacity events** (no staff calendar): follow the official Ticket Booking recipe instead — seat capacity as **inventory items** per show date and section — and keep the `booking` module for time-slot services.
- **Acceptance:** two customers cannot hold the same slot; an abandoned checkout frees the slot automatically; cancellation inside the policy refunds.

### 6.4 Wholesale — `wholesale/`

- **Start from the official B2B starter** (`medusajs/b2b-starter`, maintained): reuse its company / employee / quote / approval module designs rather than inventing new ones; copy code into `wholesale/backend` like any starter (§8.1).
- **Custom module `company`:** `company` (name, contacts, tax_id, status, payment_terms prepaid/net_15/net_30/net_60, credit_limit, currency_code), `employee` (spending_limit, is_admin). **Later:** `quote`.
- **Links:** employee ↔ customer (one ↔ one), company ↔ customer group (the price tier).
- **Catalog scope (recipe):** a B2B **sales channel** + its own publishable key, so the B2B storefront only sees B2B products.
- **Pricing:** core **price lists** with a customer-group rule (`customer.groups.id`) per tier; quantity tiers via each price's `min_quantity` / `max_quantity`.
- **Hooks / workflows:** `addToCartWorkflow` `validate` → minimum order quantity and approved company; `completeCartWorkflow` `validate` → employee spending limit and company credit limit; `request-quote` / `accept-quote` (via draft orders); approval flow for orders above a limit.
- **Payments:** manual "invoice / net terms" payment provider; invoice PDF.
- **API routes:** `/store/companies/me`, `/store/companies/me/employees`, `/store/quotes`.
- **Client app:** `wholesale/storefront` — B2B buyer shop behind login (`NEXT_PUBLIC_REQUIRE_LOGIN`): bulk add by SKU / CSV, reorder, invoices, quotes, company users.
- **Env:** `WHOLESALE_REQUIRE_APPROVAL` (new companies need admin approval).
- **Optional:** ERP integration exactly as in the official ERP recipe.
- **Acceptance:** a Gold company sees Gold prices; an employee over their limit cannot complete checkout.

### 6.5 Reseller — `reseller/`

- **Custom module `seller`:** `seller` (handle, name, email, domain, status, commission_rate), `seller_commission` (order_id unique, order_total, rate, amount, currency_code, status pending/approved/paid/cancelled, paid_at). **Later:** `seller_payout`.
- **Links:** seller ↔ sales channel (one ↔ one — the seller's storefront publishable key).
- **Workflows:** `record-seller-commission` (order → sales channel → seller → commission; idempotent; ignores channels without an active seller), triggered by subscriber `order.placed`; `cancel-commission` on order cancel / refund; monthly payout batch.
- **Seller auth:** custom actor type `seller` (auth identity via `setAuthAppMetadataStep`; `/auth/seller/emailpass`), seller-scoped routes under `/sellers/*` protected with `authenticate("seller", ["session", "bearer"])`. `/sellers/*` is not covered by `storeCors`/`adminCors`, so a CORS middleware reading `SELLER_CORS` is added for it; portal domains also go in `AUTH_CORS`.
- **API routes:** `/sellers/me`, `/sellers/me/products` (choose which of your products appear in their channel), `/sellers/me/commissions`.
- **Client apps:** `reseller/storefront` — one multi-tenant deployment serving every seller domain; it resolves the seller by domain (`SELLER_RESOLVE_MODE`) and uses that seller's publishable key. `reseller/seller-portal` — product selection, sales, commissions.
- **Env:** `RESELLER_DEFAULT_COMMISSION_RATE`, `RESELLER_PAYOUT_DAY`.
- **Acceptance:** an order in a seller's channel creates exactly one commission, even if the event is delivered twice; orders from your own channel create none.

### 6.6 Marketplace — `marketplace/`

- **Custom module `marketplace`:** `vendor` (handle, name, email, logo, status, commission_rate), `vendor_admin` (email, names), `vendor_payout` (amount, currency, status, period, paid_at, reference).
- **Links:** vendor → products, vendor → orders (child orders), vendor → stock locations.
- **Vendor auth:** custom actor type `vendor` (as in the official Vendors example: `/auth/vendor/emailpass/register` → `create-vendor` workflow with `setAuthAppMetadataStep` → `authenticate("vendor", ["session", "bearer"])`); signup → admin approval; vendor-scoped routes under `/vendors/*` (every query filtered by the logged-in vendor). A CORS middleware reading `VENDOR_CORS` covers `/vendors/*`.
- **Workflows:** `create-vendor`, `create-vendor-product` (links product to vendor, status draft until approved), **`create-vendor-orders`** exactly as in the official Vendors example: a custom route **`POST /store/carts/:id/complete-vendor`** runs a workflow that calls `completeCartWorkflow` (parent order), groups items by vendor, creates one child order per vendor with `createOrderWorkflow`, and links them (compensation deletes child orders). The storefront calls this route instead of the core complete-cart route. Wrap it in `acquireLockStep` / `releaseLockStep` on the cart id and check existing links first, as the `completeCartWorkflow` reference requires for wrappers, `record-vendor-commission`, `create-payouts` (scheduled).
- **Admin:** vendor approval queue, product moderation, payout report.
- **Client apps:** `marketplace/storefront` (shows vendor name/shop pages) and `marketplace/vendor-portal` (products, orders, fulfillments, payouts).
- **Env:** `MARKETPLACE_DEFAULT_COMMISSION_RATE`, `MARKETPLACE_REQUIRE_PRODUCT_APPROVAL`, `MARKETPLACE_PAYOUT_DAY`.
- **Payouts:** start with manual payouts from a report; automate only if the payment provider supports split payments.
- **Acceptance:** a cart with items from two vendors produces two child orders that each vendor sees and fulfills separately; payouts equal order totals minus commission.

---

## 7. Recommended build order

| Phase | Deliverable | Size | Depends on | Why this position |
|---|---|---|---|---|
| **0. Foundation** | Backend standard (§4.1) and web client standard (§4.2) proven in `ecommerce/`: working `backend` + `storefront` deployed to Dokploy (server, worker, storefront); `scripts/update-medusa.sh`, `scripts/verify.sh`; CI matrix per deployable; `docker-compose.local.yml` | M | — | Proves R1–R4 and independent deploys before business logic exists. Every other category copies these two standards. |
| **1. Ecommerce** | `ecommerce/backend` + `ecommerce/storefront` production MVP | S | 0 | The core every other scenario builds on; fastest path to a live, earning project. |
| **2. POS** | `pos/backend`, `pos/storefront`, `pos/pos-app` | M | 1 | Reuses all of Ecommerce; adds registers, shifts and the first non-storefront client. |
| **3. Booking services** | `booking-services/backend` + `storefront` | M–L | 1 | First scenario that hooks into core cart flows; hold/expiry logic must be solid. |
| **4. Wholesale** | `wholesale/backend` + `storefront` | M | 1 | Mostly core price lists + a small module + checkout validation hooks. |
| **5. Reseller** | `reseller/backend`, `storefront` (multi-tenant), `seller-portal` | M–L | 1, 4 | Second actor type and money owed to partners; builds on company/actor patterns from 4. |
| **6. Marketplace** | `marketplace/backend`, `storefront`, `vendor-portal` | L | 1, 5 | Hardest: vendor actor, order splitting, payouts, moderation. Built last so actor-type, portal and commission patterns are proven in 5. |

Rules for the order:

- **Phases 2–4 may be reordered by business priority.** Phases 0 and 1 always come first; Phase 6 always comes after Phase 5.
- **Inside each phase, build backend first, then storefront, then portal / app.** A client is only started once the backend API it needs exists.
- **Each phase ends with:** CI gate green for every deployable in the category; the whole category deployed to a Dokploy staging project using only its committed `Dockerfile`s and `.env.example`s; one Medusa update done with `scripts/update-medusa.sh`; each app redeployed alone once to prove independence.
- **Do not start two "L" phases at the same time.**
## 8. Update and release process

```
scripts/update-medusa.sh <category|category/app|all> [version]   # default: latest
```

Per deployable, the script will:

1. Read the target version (`npm view @medusajs/medusa version` when not given).
2. Set every `@medusajs/*` dependency on the Medusa release line (backend **and** that category's clients) to that exact version; set `@medusajs/ui` (own version line) to the version the `dtc-starter` pins for that release; optionally bump `packageManager` to the latest pnpm.
3. `pnpm install` → new `pnpm-lock.yaml`.
4. Run `scripts/verify.sh <category>`:
   - `pnpm build` then `pnpm typecheck`
   - integration tests
   - fresh Postgres: `medusa db:migrate`, start, `GET /health` = 200, `GET /app` = 200
   - upgrade path: restore a copy of the previous version's database, migrate, start, health check
   - clients: `pnpm build` of each storefront / portal / app against the updated backend
5. On success: commit `package.json` + `pnpm-lock.yaml` for that category only.

Release:

1. Read the Medusa release notes for every version skipped (breaking changes are called out there) and run any codemod they list (e.g. `replace-zod-imports` for v2.13).
2. **Back up the app's database** (migrations cannot be rolled back automatically).
3. Deploy to staging via Dokploy, smoke test, then production.
4. Rollback = redeploy the previous commit / image **and restore the backup if the new version ran migrations**.

Automation (Phase 0): Dependabot (or Renovate) configured **per deployable folder**, grouping all `@medusajs/*` packages of one category (backend + clients) into one PR; CI runs the verify gate for that category; merging redeploys only the changed deployables (Dokploy watch paths).

---


### 8.1 Storefront / portal starter updates

The `dtc-starter` (backend and storefront) is copied, not installed. Each client's README records the starter commit it was copied from. To take upstream starter improvements: diff the starter between the recorded commit and its latest commit, apply the relevant parts by hand, update the recorded commit. Medusa package updates for clients go through the normal update script.
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
| Redis modules | Workflow engine option shape is `{ redis: { redisUrl } }` (`url` deprecated since v2.12.2). Caching Module needs `MEDUSA_FF_CACHING=true` and the `@medusajs/caching-redis` package; `cache-redis` is deprecated (docs-verified 2026-09-25). |
| S3 provider options | `file_url`, `access_key_id`, `secret_access_key`, `region`, `bucket`, `endpoint`, `additional_client_config` (e.g. `forcePathStyle` for MinIO). |
| Storefront starter | *Superseded 2026-09-25:* the spike used the standalone `nextjs-starter-medusa`, now archived. The `dtc-starter` storefront is pnpm-based and pinned, but still has no `output: "standalone"`, still requires `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` at build (`check-env-variables.js`), and still calls the backend from `generateStaticParams`. Re-verify the guard need in Phase 0. |
| Storefront env | *Corrected 2026-09-25:* the `dtc-starter` storefront reads **`NEXT_PUBLIC_MEDUSA_BACKEND_URL`** (`src/lib/config.ts`), for both browser and server. A server-only `MEDUSA_BACKEND_URL` requires starter change 6 (§4.2). |
| Runtime check | Production build (server + Redis) started cleanly; `/health` and `/app` returned 200 for all six backend shapes (storefront/portal images are first built in Phase 0); booking hold / double-booking / hold-expiry and reseller commission idempotency behaved as designed. |

---

## 10. Open decisions and risks

| # | Decision / risk | Needed by |
|---|---|---|
| D1 | Payment providers per business project (card, QR, cash on delivery, net terms) and whether any supports split payments for vendors / sellers | Phase 1 |
| D2 | Notification channels (email, SMS, messaging apps) | Phase 1 |
| D3 | File storage provider (S3, R2, MinIO on your own server) | Phase 0 |
| D4 | Storefront design: keep the official starter's look or restyle per category | Phase 1 |
| D5 | POS app: planned as a Next.js PWA (Dockerfile committed). Switch to React Native only if hardware (printer, scanner, card reader) needs native access; that app would ship through app stores, not Dokploy | Phase 2 |
| D6 | Staging environment in Dokploy (separate project, separate databases) | Phase 0 |
| R-a | Medusa minor release with a breaking change → caught by CI gate; may need code changes before updating | ongoing |
| R-b | Migration applied then rollback needed → requires DB backup restore | every release |
| R-c | Duplicated boilerplate drifts between folders → Phase 0 `verify.sh` also diffs the standard files across folders | ongoing |
| R-d | Client built against an old publishable key or backend URL → keys and URLs are build args; changing them means rebuilding that client (documented in each `.env.example`) | ongoing |
| R-f | Official starters/recipes change (e.g. the v2.14 move to `dtc-starter`) → re-check docs.medusajs.com and the starter repos at the start of every phase, not only Medusa package versions | every phase |
| R-e | Worker and server accidentally both run migrations → worker env always has `RUN_MIGRATIONS=false` (in every backend `.env.example`) | every deploy |
