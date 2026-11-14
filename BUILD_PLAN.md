# Build Plan — Medusa Apps

> **Revision 14 (2026-11-14, owner: "include all features, update to build plan").** §6.3 turns Booking services into a booking-only shop with eight booking kinds (A–H) and shared booking features, built as tasks P3-19 to P3-30 before the Booking staging run (TASKS F-087, D12). The other phases don't change.
>
> **Revision 13 (2026-11-13, owner: "update build plan").** §6.2 adds the POS admin pages Cashiers and Registers, so staging needs no `curl` (TASKS F-085). Requirements, scope and build order are unchanged.
>
> **Revision 12 (2026-11-12, owner: "approve to record").** Brings §6.6 and §7 in line with the Marketplace as built (P6-01 to P6-15, TASKS F-072 to F-080): a full copy of Ecommerce, child orders made by the Order Module, the split run per order, shipping split across vendors, commissions held on refunds, and vendor stock. Requirements, scope and build order are unchanged.
>
> **Revision 11 (2026-11-12, owner: "Fix those", applied on "Yes").** Brings §6.2, §6.4, §6.5 and §7 in line with Wholesale P4-08 to P4-13 and the review fixes (TASKS F-066 to F-070, the first review's fix list, now done). Requirements, scope and build order are unchanged.
>
> **Revision 10 (2026-11-12, owner: "Update old places in build plan too").** Builder documents moved into `docs/`; §2 and every path in this plan follow (TASKS F-071). Nothing else changed.
>
> **Revision 9 (2026-11-11, owner).** A clean rewrite: the plan now describes the repo as it is, with each rule given once, and the revision notes moved to *Revision history* at the end. It takes in TASKS F-055 to F-065, V-06 and decisions D9 to D11. Requirements, scope and build order are unchanged.
>
> **Status (2026-11-12).** Phase 0 is done. Phase 1 (Ecommerce) is on staging, and production (P1-08) waits on the owner. Phases 2 (POS), 3 (Booking services), 4 (Wholesale), 5 (Reseller) and 6 (Marketplace) have their code done, with staging and the exit checklists (P2-14, P3-18, P4-11, P5-11, P6-13) waiting on the owner. Progress, decisions and evidence are in `docs/TASKS.md`.

**Versions in this repo (checked 2026-11-12)**

| Package | Version | Since |
|---|---|---|
| Medusa (`@medusajs/*`, every app) | **2.22.6** (security release: stricter `fields` / filter / `order` query parsing) | 2026-11-10 (TASKS V-06) |
| `@medusajs/ui` | **4.2.13** (the version `@medusajs/dashboard@2.22.6` depends on) | 2026-11-10 |
| Node | `>=22.23.4` | 2026-11-06 |
| Next.js (every web client) | **16.4.5** | 2026-11-06 (V-04) |
| pnpm | **12.18.0** (V-07) | 2026-11-12 |
| Starters | `dtc-starter` (`6440e85`) and `b2b-starter` (`f352e3c`) on 2.22.6 | 2026-11-09 |

Updates are separate tasks (§8). This table records what the code uses.

Contents

1. Goals and hard requirements
2. Repository layout
3. Upstream compatibility strategy
4. Deployable standards (backend, web client, local testing)
5. Dokploy deployment plan
6. Scenario plans (Ecommerce, POS, Booking, Wholesale, Reseller, Marketplace)
7. **Recommended build order**
8. Update and release process
9. Verified technical notes
10. Decisions and risks

Revision history

---

## 1. Goals and hard requirements

| # | Requirement | How this plan meets it |
|---|---|---|
| R1 | Use official Medusa source, never modify upstream, latest Medusa and pnpm | Medusa is used **only as published npm packages** (`@medusajs/*`): no fork, no git submodule, no `pnpm patch`, no edits in `node_modules`. Custom code goes only through official extension points (§3). Boilerplate is copied from the official starters (§4). |
| R2 | Always compatible with Medusa updates; deploy an update at any time | Exact version pins, a lockfile per deployable, a scripted update per category, a CI gate before any deploy (build, typecheck, tests, migrate, health check), and Dokploy rollback (§3, §8). |
| R3 | Dokploy-ready, **not a monorepo**: one folder per scenario, each with the backend **and** its clients, each with its own `Dockerfile` and env, each deployed independently | Six category folders. Each has one sub-folder per deployable, with its own `Dockerfile`, `.env.example`, `package.json` and lockfile. No root `package.json`, no workspace, no shared code. Each sub-folder is its own Docker context and Dokploy app (§2, §5). |
| R4 | Each scenario has its own dependencies | Each deployable has its own `package.json`, `pnpm-lock.yaml` and `node_modules`. Nothing is shared between sub-folders or categories. |
| R5 | Side-by-side comparison in the project root | `docs/COMPARISON.md` (moved from the root into `docs/` on the owner's request, 2026-11-12, F-071; linked from the root `README.md`) |
| R6 | Pre-build plan with a recommended build order in the project root | This file, §7 |

**Honest limit on R2.** The starters are templates that get copied, not packages, so their upstream changes are merged by hand (§8.1). No repo can promise that every future Medusa release is non-breaking: Medusa sometimes ships breaking changes in minor versions (listed in its release notes), and database migrations only go forward. This plan does guarantee three things:
- an update never reaches production without passing the CI gate
- each category, and each deployable in it, is updated and deployed on its own
- the previous working image can be deployed again

---

## 2. Repository layout

```
medusa-apps/                        <- plain git repo, NOT a workspace
├── README.md                       <- overview and status
├── BUILD_PLAN.md                   <- this file (R6), frozen (§3.4); its lock names this path
├── CLAUDE.md                       <- builder entry point (Claude Code reads it from the root)
├── docs/                           <- every other document (owner, 2026-11-12, F-071):
│   ├── COMPARISON.md               <- side-by-side comparison (R5)
│   ├── MEDUSA_SKILL.md             <- the only allowed Medusa reference, per version
│   ├── BACKEND_PATTERNS_SKILL.md   <- design patterns mapped to Medusa extension points
│   ├── DEV_FLOW.md                 <- the builder's cycle and gates
│   ├── TASKS.md                    <- tasks, decisions, findings, handoff
│   ├── PRE_DEPLOY_AUDIT.md         <- 10-check audit before staging or production (§8)
│   └── PLAN_LOCK.md, …             <- owner notes, handovers, plan proposals
├── .claude/                        <- builder settings and the plan lock hook (§3.4)
├── .github/                        <- CI matrix (one entry per deployable) and the weekly update check
├── scripts/                        <- plain shell scripts, no package.json
│   ├── update-medusa.sh            <- §8
│   ├── verify.sh                   <- DEV_FLOW gates 1–4, `--image` builds and smoke-tests the image
│   ├── guard.sh                    <- repo guardrails (DEV_FLOW gate 5), also run in CI
│   └── test-plan-lock.sh           <- tests the plan lock (§3.4)
│
├── ecommerce/                      <- one business project = one Dokploy project
│   ├── README.md                   <- Dokploy guide for this project
│   ├── DOKPLOY_STAGING.md          <- click-by-click staging runbook (also in pos/)
│   ├── AUDIT-<date>.md             <- pre-deploy audit reports (§8)
│   ├── docker-compose.local.yml    <- local stack (§4.3)
│   ├── backend/                    <- Medusa (server + worker)
│   └── storefront/                 <- Next.js shop
├── pos/                            <- backend, storefront, pos-app (Next.js PWA for the counter)
├── booking-services/               <- backend, storefront (shop + booking pages)
├── wholesale/                      <- backend, storefront (B2B shop, login required)
├── reseller/                       <- backend, storefront (one site for every seller domain), seller-portal
└── marketplace/                    <- backend, storefront, vendor-portal
```

| Category | Deployables (each has its own Dockerfile, env and Dokploy app) | Copied from |
|---|---|---|
| ecommerce | backend (+ worker), storefront | `dtc-starter` |
| pos | backend (+ worker), storefront, pos-app | Ecommerce; pos-app is a plain Next.js app |
| booking-services | backend (+ worker), storefront | Ecommerce |
| wholesale | backend (+ worker), storefront | `b2b-starter` |
| reseller | backend (+ worker), storefront, seller-portal | Ecommerce; seller-portal is a plain Next.js app |
| marketplace | backend (+ worker), storefront, vendor-portal | not started |

Names are lowercase kebab-case, because they become Dokploy build paths, image names and database names.

**Rules that keep deployments independent:**
- No root `package.json`, no root `pnpm-workspace.yaml`, no shared `packages/` folder.
- No sub-folder imports from another sub-folder or category. Clients talk to their backend **only over HTTP**.
- Duplicated boilerplate is intentional: it is the price of independent deploys.
- Any sub-folder can be copied into its own repo and still build.
- The backend image is deployed twice per project (server and worker); everything else once.
- A category copied from another is a full copy that then lives on its own (F-034, F-044, F-061). The starter's eight generic `backend/src/*/README.md` guides are not kept (F-053).

## 3. Upstream compatibility strategy

### 3.1 Allowed extension points (official, versioned APIs)

| Need | Use | Never |
|---|---|---|
| New data | Custom **module** (`src/modules/*`) with its own tables | Columns on core tables |
| Relate custom data to core data | **Module links** (`src/links/*`, `defineLink`) | Foreign keys into core tables |
| Business logic | **Workflows** and steps with compensation (`src/workflows/*`) | Overriding core services |
| Change core flows (add to cart, checkout) | **Workflow hooks** (`validate`, …) or a custom workflow that *calls* core workflows | Copying and editing core workflow code |
| React to events | **Subscribers** (`src/subscribers/*`) | Patching the event bus |
| Background tasks | **Scheduled jobs** (`src/jobs/*`) | External cron calling internals |
| New endpoints | **API routes** (`src/api/*`) and middlewares | Monkey-patching core routes |
| Admin UI | **Admin widgets and UI routes** (`src/admin/*`) | Forking the dashboard |
| Payments, email, files, … | **Module providers** (e.g. `AbstractPaymentProvider`) | Patching core modules |
| Infrastructure | Official modules configured in `medusa-config.ts` (Redis, S3, …) | Forks of infrastructure modules |

### 3.2 Version policy

- **One Medusa version per app.** Inside an app, every `@medusajs/*` package on the Medusa release line is pinned to the **same exact version** (no `^` or `~`). Apps may sit on different releases (F-044); a new category starts on the newest release, and older apps move with `scripts/update-medusa.sh <category> <version>`, one branch each.
- **`@medusajs/ui` has its own version line.** Pin it to the exact version `@medusajs/dashboard@<medusa version>` depends on, so the lockfile holds one copy (F-006). `update-medusa.sh` reads it from the dashboard. For 2.22.6 that is 4.2.13.
- **pnpm:** `packageManager: "pnpm@<exact>"` in each `package.json`; the Dockerfiles and CI install exactly that version. A new pnpm release is taken once it is about a week old (V-03), because it runs every install.
- **pnpm's minimum release age:** pnpm 12 refuses packages younger than its minimum release age. An update on release day writes `minimumReleaseAgeExclude` entries for the exact new versions into each app's `pnpm-workspace.yaml`. Keep them for a security release, and remove them at the next update (F-057).
- `pnpm install --frozen-lockfile` everywhere (CI, Docker, local checks). A build never resolves new versions on its own.
- **Public imports only:** `@medusajs/framework/*`, `@medusajs/medusa/*`, `@medusajs/medusa/core-flows`, `@medusajs/admin-sdk`, `@medusajs/ui`. Never from `dist/` paths.
- **Licensed Medusa features are not used.** Since 2.22 the RBAC module and the `auth-oidc` provider need a `MEDUSA_LICENSE_KEY` (F-042). Cashiers, sellers and vendors are custom actor types.
- **Security fixes in dependencies** (`pnpm audit --prod`): first refresh the lockfile within the ranges Medusa and the starters already allow. A `pnpm.overrides` entry is a deviation that needs owner approval and a `docs/TASKS.md` entry (E-A6).

### 3.3 Tests that protect updates

Every backend keeps integration tests (`@medusajs/test-utils`) for its custom code against real Medusa, and every client must at least build against the updated backend. An update is accepted only if these pass (§8).

Tests that depend on background work (scheduled jobs, search indexing) control it or wait for it instead of racing it. For example, a test makes a hold expire right before the step that checks it, and it rebuilds the search index with the Search Module's `reindex` when events may have been lost (F-065).

### 3.4 Plan lock (F-054)

This file is frozen for the builder:
- **The hook:** `.claude/hooks/protect-build-plan.sh`, wired in `.claude/settings.json`. It blocks Claude's file tools and shell writes on `BUILD_PLAN.md`, `.build-plan.sha256`, the hook and `.claude/settings.json`.
- **The switch:** the hook lets the edits through only while the owner's git-ignored switch `.claude/plan-unlocked` exists in that checkout. Only the owner creates or removes it, from their own terminal (`docs/PLAN_LOCK.md`); Claude never does.
- **The checks:** `scripts/test-plan-lock.sh` tests the lock and runs in `scripts/guard.sh`. CI fails until `.build-plan.sha256` matches, so every revision is recorded.
- **Between revisions:** findings go to `docs/TASKS.md`, and a proposed revision goes to `docs/`.

---

## 4. Deployable standards

There are two standards: **4.1 backend** (the same in every `*/backend`) and **4.2 web client** (every `storefront`, `*-portal` and `pos-app`). Each deployable commits its `Dockerfile`, `.dockerignore` and `.env.example`; backends also commit `docker-entrypoint.sh`. A deployable with no code yet keeps these as templates.

### 4.1 Backend standard (`<category>/backend/`)

```
<category>/backend/
├── package.json              # own deps, exact @medusajs pins, packageManager
├── pnpm-lock.yaml            # own lockfile
├── pnpm-workspace.yaml       # pnpm SETTINGS for this app only (no `packages:` key)
├── medusa-config.ts          # env-driven; custom modules listed at the top
├── tsconfig.json, jest.config.js, instrumentation.ts   # from the starter
├── Dockerfile                # multi-stage, standalone
├── docker-entrypoint.sh      # migrations + start, server/worker aware
├── .dockerignore, .gitignore
├── .env.example              # every variable documented
├── README.md                 # what it is, starter commit, how to run and deploy
├── integration-tests/
└── src/
    ├── modules/<scenario>/   # models, service, migrations (+ .snapshot-*.json)
    ├── links/
    ├── workflows/
    ├── subscribers/
    ├── jobs/
    ├── api/
    ├── admin/
    ├── search/               # Search Module index definitions (starter ships product.ts)
    ├── migration-scripts/    # data migrations, run by db:migrate on every deploy: never seeds (F-002)
    └── scripts/              # seed scripts (`medusa exec`, e.g. `pnpm seed`)
```

**Where the boilerplate comes from:** `apps/backend` of the official `medusajs/dtc-starter` (Wholesale: `medusajs/b2b-starter`). The starters are pnpm and Turborepo monorepos, so only `apps/backend` is copied, and the workspace-level settings move into this app's own `pnpm-workspace.yaml`. Record the starter commit in the backend README. Add a `predeploy` script (`medusa db:migrate`) and a `typecheck` script; the starter ships neither.

#### `pnpm-workspace.yaml` (per deployable)

The official [pnpm guide](https://docs.medusajs.com/learn/configurations/pnpm) puts four `public-hoist-pattern` entries in `.npmrc`. pnpm 11 and later don't read them there, so the same entries go into `pnpm-workspace.yaml` as `publicHoistPattern`. Without a `packages:` key the file only holds settings, so the app stays a single package.

```yaml
publicHoistPattern:          # required by the Medusa Admin build
  - "*@medusajs/*"
  - "@tanstack/react-query"
  - "react-i18next"
  - "react-router-dom"
allowBuilds:                 # pnpm blocks install scripts unless allowed
  "@medusajs/telemetry": false   # false = opt out of telemetry
  "@swc/core": true
  esbuild: true
  msgpackr-extract: true
  protobufjs: true
```

#### `medusa-config.ts` behaviour

| Env | Effect |
|---|---|
| `DATABASE_URL` | Postgres connection (one database per business project) |
| `DATABASE_SSL` | `false` / `true` / unset → `projectConfig.databaseDriverOptions`. Medusa turns SSL on for any non-localhost database, which hangs migrations on a Dokploy Postgres without SSL, so set `false` there (F-003). |
| `REDIS_URL` set | Sets `projectConfig.redisUrl` (session store) and enables the modules from the official [deployment guide](https://docs.medusajs.com/learn/deployment/general): `caching` with provider `@medusajs/caching-redis` (a separate npm package), `event-bus-redis`, `workflow-engine-redis` (`{ redis: { redisUrl } }`), and `locking` with provider `locking-redis`. All of them use one Redis URL. Unset = in-memory (dev only). |
| `MEDUSA_FF_CACHING` | `true`. The Caching Module, which the deployment guide configures, is behind this feature flag; the old `cache-redis` module has been deprecated since v2.11.0. |
| `MEDUSA_WORKER_MODE` | `projectConfig.workerMode`: `shared` (default), `server` (HTTP only) or `worker` (jobs and subscribers only) |
| `DISABLE_MEDUSA_ADMIN` | `admin.disable`; `true` on workers |
| `MEDUSA_BACKEND_URL` | `admin.backendUrl`; leave empty when the same app serves the admin |
| `S3_*` set | Enables `file` with the `file-s3` provider (S3 and S3-compatible servers: R2, MinIO, RustFS, SeaweedFS). Containers are ephemeral, so production uploads must go to S3. Use one bucket per shop and environment, with no key prefix (F-025). |
| `S3_ACL` | Empty = Medusa's default per-file ACL; `false` = send no ACL header (needed for AWS buckets with Object Ownership "Bucket owner enforced", F-025). |
| `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `JWT_SECRET`, `COOKIE_SECRET` | Standard Medusa settings |
| `SESSION_COOKIE_SECURE` | `false` only in the local Podman/Docker stack (plain http), so the admin session cookie isn't marked Secure. Never set it on Dokploy (F-043). |
| `STOREFRONT_URL` | Used for links in account emails (verification, password reset) and for the storefront cache refresh. Without it, sign-up emails aren't sent. Set it in every environment, local stacks included (F-050). |

The variable names match the official deployment guide. Migrations run only on the server instance, like the guide's `predeploy` step; the worker never migrates.

#### Backend Dockerfile design

1. **Build stage:** `docker.io/library/node:22-bookworm-slim`. The fully-qualified name lets Podman/Buildah build it too, and the image is multi-arch (arm64 and amd64).
2. Copy `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`. Install the pnpm version read from `packageManager`, then run `pnpm install --frozen-lockfile`.
3. Copy the source and run `pnpm build` (`medusa build` → `.medusa/server`, including the compiled admin).
4. In `.medusa/server`, copy in `pnpm-lock.yaml` and `pnpm-workspace.yaml` (the build doesn't copy the lockfile), then run `pnpm install --prod --frozen-lockfile`.
5. **Runtime stage:** same base image. Copy only `.medusa/server`, run as the `node` user, expose `9000`. `medusa start` runs inside `.medusa/server` (F-009), and the entrypoint runs `cd /app` first, because the Dokploy terminal opens in `/` (F-013).
6. **Entrypoint:**
   - **`start`:** runs `medusa db:migrate --execute-safe-links --execute-safe-search` (only when `MEDUSA_WORKER_MODE` ≠ `worker` and `RUN_MIGRATIONS` ≠ `false`), then `medusa start`.
   - **The two flags:** without them `db:migrate` prompts when a link or search index was removed or changed, and a container has no terminal to answer. Safe mode never drops link tables or indexes; dropping them is a manual release step (§8).
   - **One replica while migrating:** `db:migrate` takes only a per-module advisory lock (F-004), so still run one server replica.
   - **Other commands** are passed through (e.g. `medusa user -e … -p …` to create an admin).
7. **Build args:** `MEDUSA_BACKEND_URL` (optional, baked into the admin bundle), plus the scenario build args in §6 (e.g. Ecommerce's upload ceiling).

There is no `HEALTHCHECK` instruction (Podman ignores it in OCI format). Health checks are set in Dokploy against `GET /health` (§5).

#### `.env.example`

Committed per backend, with CORS entries for that category's clients and its scenario settings (§6). Base keys:

```
NODE_ENV=production
PORT=9000
DATABASE_URL=postgres://user:pass@host:5432/<category>
DATABASE_SSL=false
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
S3_ACL=
MEDUSA_FF_CACHING=true
STOREFRONT_URL=
```

### 4.2 Web client standard (`storefront/`, `*-portal/`, `pos-app/`)

```
<category>/<client>/
├── package.json          # own deps; @medusajs/js-sdk, icons, types, ui-preset on the backend's version
├── pnpm-lock.yaml
├── pnpm-workspace.yaml   # settings only (allowBuilds for sharp, etc.)
├── next.config.js        # MUST set output: "standalone"
├── Dockerfile, .dockerignore, .env.example
├── README.md             # starter commit, env, how to deploy
└── src/
```

- **Framework:** Next.js **16.4.5** for every web client, so there is one Dockerfile pattern.
  - **Storefronts** start from `apps/storefront` of `medusajs/dtc-starter` (Wholesale: `b2b-starter`). The standalone `nextjs-starter-medusa` was deprecated in Medusa v2.14.
  - **Portals and the POS app** are plain Next.js apps using `@medusajs/js-sdk`.
  - **Next.js 16 migration:** the storefronts follow the starter's (`6b95717`): ESLint flat config, `default.tsx` for parallel-route slots, async `params`, `revalidateTag(tag, { expire: 0 })`.
- **Starter changes required** (each storefront README lists the ones applied):
  1. **Own package setup:** its own `packageManager`, `pnpm-lock.yaml` and settings-only `pnpm-workspace.yaml`. Carry over the starter root's `pnpm.overrides` (`@types/react`, `@types/react-dom`). Keep `@medusajs/js-sdk`, `icons`, `types`, `ui-preset` and `instantsearch-adapter` on the exact backend version.
  2. **Package name:** rename it (`@dtc/storefront` → `<category>-storefront`).
  3. **`output: "standalone"`** in `next.config.js`.
  4. **Image domains:** read `S3_IMAGE_HOSTNAME` / `S3_IMAGE_PATHNAME` instead of `MEDUSA_CLOUD_S3_*`, so any bucket works.
  5. **Builds don't need the backend:** a `generateStaticParams` that calls the backend returns `[]` on error. This only applies to copies made before `dtc-starter` `f677db4` (2026-10-09); later starters have no such functions.
  6. **Internal backend URL on the server:** `src/lib/config.ts` prefers a server-only `MEDUSA_BACKEND_URL` when `typeof window === "undefined"`, so server-side calls use the private Dokploy hostname.
  7. **Product pages render dynamically:** `export const dynamic = "force-dynamic"` on `products/[handle]/page.tsx`. The starter's `cookies()` helper swallows Next's `DynamicServerError` (F-015).
  8. **`outputFileTracingRoot: __dirname`** in `next.config.js`, so `server.js` lands at the standalone root (F-010).
  9. **Admin changes reach the shop without a redeploy:**
     - an on-demand route `/api/revalidate` (secret header, `revalidatePath("/", "layout")`), called by a backend subscriber on catalog events
     - `revalidate: 600` on catalog fetches, as a safety net for changes without events (e.g. price lists; P1-10)
  10. **Orders are never cached:** `retrieveOrder` and `listOrders` use `cache: "no-store"` (F-052).
  11. **No locale calls without translations:** call `GET /store/locales` only when `STOREFRONT_LOCALES=true` (F-051).
  12. **Friendly errors:**
      - `src/app/[countryCode]/error.tsx` and `src/app/global-error.tsx` show a short "Something went wrong" page
      - `poweredByHeader: false`
      - `medusa-error.ts` logs status and path only, never the backend's response body or headers (E-A2, E-A4)
- **Portals and the POS app call the backend from their own server.** The browser calls the app's own routes, and the app calls the backend with the user's token, which is kept in a sealed httpOnly cookie (`COOKIE_SECRET`). The backend URL and the token never reach the browser (F-040; also the seller portal, P5-08).
- **Dockerfile design:** the same fully-qualified multi-arch base image as the backend.
  - **Build:** `pnpm install --frozen-lockfile`, then `pnpm build`.
  - **Runtime:** copies only `.next/standalone`, `.next/static` and `public` (every client has a `public/` folder), and runs `node server.js` as `node`.
  - **Ports:** storefront 8000; portals and the POS app 3000.
- **Env split:**
  - **Build-time:** `NEXT_PUBLIC_*`, and anything `next.config.js` reads, are **Dokploy Build-time Arguments** (`ARG` in the Dockerfile). Build-time URLs must be public.
  - **Runtime:** secrets and server-side URLs are runtime variables. The runtime `MEDUSA_BACKEND_URL` can be the internal Dokploy hostname.

| Client | Build-time args | Runtime vars |
|---|---|---|
| storefront | `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (public), `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DEFAULT_REGION`, `NEXT_PUBLIC_STRIPE_KEY` (starter's; unused without Stripe), `S3_IMAGE_HOSTNAME`, `S3_IMAGE_PATHNAME` (+ scenario args) | `MEDUSA_BACKEND_URL`, `REVALIDATE_SECRET` (equal to the backend's) (+ scenario vars) |
| seller-portal / vendor-portal / pos-app | `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_BASE_URL` | `MEDUSA_BACKEND_URL`, `COOKIE_SECRET` |

### 4.3 Local testing

Each category has a `docker-compose.local.yml` (Postgres, Redis, backend, clients) to run the whole business locally. Dokploy ignores it.
- **Start it** with Podman (`podman compose -f <category>/docker-compose.local.yml up -d --build`) or Docker.
- **Plain http:** the stack serves http, so the backend sets `SESSION_COOKIE_SECURE=false`. It also sets `STOREFRONT_URL`, so account emails work (F-043, F-050).
- **Networking:** the storefront shares the backend's network namespace, so `localhost:9000` is the backend in the browser and in the container.
- **One stack at a time:** host ports are the same in every category.

For the gates, `scripts/verify.sh` runs against a throwaway Postgres. Wait for its *second* "ready to accept connections" before creating a database: Postgres restarts once during first setup.

## 5. Dokploy deployment plan

**One category folder = one Dokploy project.** Each category README has the exact service table and first-deploy order.

| Dokploy resource | Settings |
|---|---|
| **PostgreSQL** | One per project. Never share a database between projects. |
| **Redis** | One per project. |
| **Build fields** (every app) | Build Type **Dockerfile**. The fields are relative to the repo root (F-011): **Build Path `/`**, **Docker File `<category>/<app>/Dockerfile`**, **Docker Context Path `<category>/<app>`**. |
| **backend (server)** | App `<category>/backend`. Env from `backend/.env.example` with `MEDUSA_WORKER_MODE=server`. Domain → 9000. Health check `/health`. |
| **backend (worker)** | Same build fields and image. Env adds `MEDUSA_WORKER_MODE=worker`, `DISABLE_MEDUSA_ADMIN=true`, `RUN_MIGRATIONS=false`. No domain, no health check. |
| **storefront** | App `<category>/storefront`. Build-time Arguments and runtime env from `storefront/.env.example`. Domain → 8000. |
| **portal / pos-app** | App `<category>/<client>`. Env from its `.env.example`. Domain → 3000. |
| **Health check** (Swarm Settings form) | **Test Commands** takes one array item per box: exactly two boxes, `CMD-SHELL` and `node -e "fetch('http://localhost:<port><path>').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"` (the images have no `curl`). Interval, timeout and start period are in the category runbook. A JSON array pasted into one box never runs, and it caused a staging outage (F-021). After saving, confirm `(healthy)` with `docker ps` on the server. |
| **Update Config** (Swarm Settings form) | Order **Start First**, Failure Action **Rollback**, Parallelism 1, Delay and Monitor 10 s, Max Failure Ratio 0. The dropdowns show blank after saving but are stored (check `docker service inspect … .Spec.UpdateConfig`, F-020). |
| **Watch paths** | Each app watches only `<category>/<app>/**`; the **worker watches `<category>/backend/**`** too. An empty box redeploys it on every push (F-019). |
| **Database backups** | Postgres → **Backups**: daily (`0 19 * * *` = 02:00 Cambodia), keep 14, to a **private** S3 bucket used only for backups, with its own access key and one prefix per project. Before go-live, restore the newest backup into a throwaway Postgres and check that orders and products match. RustFS older than 1.0.0 needs `--streaming-upload-cutoff=200M` (rustfs/rustfs#6135). |
| **Server access** | Before production: SSH-key login only, no password login for root or any uid-0 account, no public Postgres port, OS updates applied. |
| **Alerts** (E-A3) | Dokploy **Settings → Notifications** → Telegram to the staff group: **App Build Error**, **App Deploy**, **Database Backup**, **Dokploy Restart**. Dokploy has no "app down" event, so an uptime monitor **outside** the Dokploy server checks the backend `/health` and the shop every 1–5 minutes (D8). |

Small projects may run one `shared` backend instance instead of a server and a worker.

**First deploy of a project:**
1. Postgres and Redis.
2. Backend server. Migrations run, and Medusa creates a default sales channel and publishable key on first boot (F-005).
3. An admin user, from the Dokploy terminal: `docker-entrypoint.sh medusa user -e … -p …`.
4. The category's seed, from the same terminal: `docker-entrypoint.sh medusa exec ./src/scripts/seed.js`. It reuses the first-boot channel and key (F-017), and it takes positional arguments only.
5. Copy the publishable key from the admin.
6. Worker.
7. Storefront, with the key as a build arg.
8. Portal or app.
9. Put the final domains into the backend CORS and redeploy the backend.
10. Check that the storefront's key sees products (`/store/products` count > 0, F-017) and that the baked backend URL is right (F-016).

**Afterwards** every app is redeployed, rebuilt or rolled back on its own. The only coupling between apps is configuration: client URLs in the backend CORS, and the backend URL and publishable key in the clients.

**Same template, many businesses:** a second business of the same kind is a second Dokploy project with the same Build Paths and its own databases, domains and env.

## 6. Scenario plans

Each scenario lists:
- custom modules (tables prefixed to avoid collisions), links, workflows and hooks, API routes, jobs and subscribers, admin extensions
- client apps and env
- acceptance criteria

**MVP** = first release; **Later** = after launch. "As built" notes record decisions taken while building (details and evidence in `docs/TASKS.md`).

### 6.1 Ecommerce — `ecommerce/`

- **Custom code:**
  - **Modules:** `telegram_links` (table `telegram_order_chat`: order ID → Telegram chat ID, so the customer bot knows where to send updates) and `wishlist`.
  - **Providers** (§3.1): `resend` (email) and `telegram` (staff alerts and customer updates) notification providers, and the ABA PayWay payment provider.
  - **Everything else** is Medusa core plus infrastructure config.
- **Region and catalog:** the Cambodia region (USD checkout, KHR as a second store currency), tax region, Phnom Penh stock location and delivery option, created by `pnpm seed`. Files on S3 (D3). The storefront comes from `dtc-starter` (§4.2).
- **Payments: ABA PayWay** (eCommerce Checkout: cards, ABA Pay, KHQR), a custom `AbstractPaymentProvider` with provider ID `pp_payway_payway` (D1, F-022; Stripe is not available in Cambodia).
  - **Flow:** the customer pays on PayWay's page. PayWay's callback (`/hooks/payment/payway_payway`) and the customer's return to the storefront can each complete the order. The payment status is always confirmed with PayWay's Check Transaction API, never taken from the browser. A paid order is captured at once.
  - **Refunds:** made in the PayWay merchant portal for now. Automatic refunds (PayWay Refund API, which needs ABA's RSA key) come later.
  - **Whitelisting:** ABA must whitelist the shop and API domains and the server IP, separately for sandbox and live.
- **Notifications (D2):**
  - **Order confirmation email** through **Resend**.
  - **Staff alerts** through **Telegram** for new, shipped, delivered and canceled orders. `notification-local` is used when the keys are empty.
  - **Order updates for customers who opt in:** a second Telegram bot. The confirmation page offers a signed deep link, because a bot can't message first; after Start, the bot sends confirmed, shipped, delivered and canceled updates (P1-17).
- **Contact rules for Cambodia (`kh`):**
  - The shipping phone is required and email is optional; other countries need an email (P1-14, P1-16).
  - A cart with nothing to ship (booked services) asks only for an email or a phone, with no address (F-048).
  - An optional Telegram contact (`@username` or phone) is saved in the order's `metadata.telegram_contact`.
  - These rules are checked in the browser and by store API middlewares, including at cart completion.
- **Cambodia addresses (storefront only, for `kh`; no custom module, no new columns):**
  - **Field order:** First name, Last name, Address, Province / Capital (saved in `province`), Khan / Srok (`city`), Postal code, Country, Company.
  - **Choosing a place:** Province and Khan / Srok are type-to-match lists (English or Khmer) that accept only listed values. The Khan / Srok list shows only the chosen province's districts.
  - **Postal code:** filled in from the Khan / Srok (6 digits; editable, optional).
  - **Place data:** 25 provinces / capital and 210 khan / srok / krong with postal codes, from the Ministry of Posts and Telecommunications list (Prakas No. 77, 30.12.2025, via Open Development Cambodia, CC BY-SA 4.0). It lives in `src/lib/data/kh-locations.ts`, built by `scripts/build-kh-locations.mjs`; regenerate it when the ministry publishes a new list.
  - **Khmer names:** each place keeps its Khmer name (`name_km`). Medusa stores the English name; a future Khmer storefront looks the Khmer one up.
  - **Phone numbers:** 8–15 digits (with `+`, spaces, hyphens, brackets), checked in the browser and the API, and shown as written locally (`012 345 678`, `+855 12 345 678`).
  - **Where addresses show:** checkout, order page, staff alert and email show street, khan / srok and province.
- **Also built in Phase 1:**
  - **Admin changes without a redeploy:** §4.2 change 9.
  - **Admin image uploads:** SVG refused; a size limit (default 0.8 MB) that admins change in **Settings → Store**, up to an env ceiling (default 5 MB, also a build arg for the admin's own check; F-026, F-027).
  - **Items with variants:** alerts and emails list each item with its variant.
  - **Search fix:** the starter's `resolve-product-ids` is fixed for shared product options (F-023).
  - **Abuse limits:** per-IP limits on customer and admin sign-in, sign-up, forgot password, verification and password change, with an optional CAPTCHA (`CAPTCHA_PROVIDER`) on customer sign-in and sign-up (P1-21, E-A1).
- **Search:** the built-in **Search Module** (registered by default since 2.21.1, PostgreSQL provider) with the starter's `src/search/product.ts` and `@medusajs/instantsearch-adapter`. Move to another provider only if Postgres search is outgrown.
- **Scenario env (backend):**
  - **Uploads:** `UPLOAD_MAX_FILE_SIZE_MB`, `UPLOAD_MAX_FILE_SIZE_CEILING_MB` (also a build arg).
  - **Email:** `RESEND_API_KEY`, `RESEND_FROM`.
  - **Telegram:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_CUSTOMER_BOT_TOKEN`, `TELEGRAM_CUSTOMER_BOT_USERNAME`, `TELEGRAM_CUSTOMER_WEBHOOK_SECRET`.
  - **PayWay:** `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_API_URL` (empty = sandbox), `PAYWAY_RETURN_URL`.
  - **Storefront links:** `STOREFRONT_URL` and `REVALIDATE_SECRET`.
  - **Abuse limits:** the CAPTCHA keys.
- **Later:** abandoned cart and restock alerts (Commerce Automation recipe), reviews, automatic PayWay refunds.
- **Acceptance:** browse → cart → checkout → order visible in the admin; the update script and CI gate proven on this app first.

### 6.2 POS — `pos/`

- **Built as a full copy of Ecommerce** (backend and storefront), plus `pos/pos-app` (F-034).
- **Custom module `pos`:**
  - `pos_register`: name, code, is_active
  - `pos_shift`: status open/closed, opened_by, closed_by, opened_at, closed_at, currency_code, opening_cash, counted_cash, expected_cash, notes
  - `pos_cashier`: name, email, is_active; the cashier actor's record (F-036)
- **Links:**
  - register ↔ stock location (many → one)
  - register ↔ sales channel (many → one)
  - shift → orders (one → many)
- **Workflows:**
  - **`open-shift`:** one open shift per register.
  - **`close-shift`:** computes the expected cash from cash payments and stores the variance.
  - **`pos-checkout`** (official POS recipe): creates the sale as a **draft order** in the POS sales channel, applies promotions, records the payment, converts it to an order and links the order to the shift.
- **Cashiers:** a custom actor type **`cashier`** (`/auth/cashier/emailpass`, `authenticate("cashier", ["session", "bearer"])`), because Medusa's admin roles aren't usable (§3.2, R-g).
  - **Invite-only:** an admin creates the cashier first (the answer carries an **invite code**); the cashier registers the invited email and accepts with that code (F-036, review fix B11).
  - **Shifts:** any active cashier can sell on and close any open shift. The shift records who opened and closed it, and each sale records its cashier (`pos_cashier_id`).
- **Payments:**
  - **One provider:** everything goes through `pp_system_default`. Each POS payment session carries `metadata.pos_payment_method` = `cash`, `card` or `qr`, and close-shift counts only `cash` (F-037, F-038).
  - **The money:** the cashier takes it (drawer, card terminal, KHQR stand), and the sale records it.
  - **Later:** a card terminal provider (D1).
- **Stock at the counter:**
  - **Fulfilment:** Medusa takes stock only on fulfilment, which needs a shipping option, so each register location gets a hidden "In store (POS)" option. Stock is reserved at the register's location only.
  - **Reservations:** never moved by changing their `location_id` (upstream `@medusajs/inventory` bug, still in 2.22). Delete the reservation and create it again (F-041).
- **API routes:** `/pos/registers`, `/pos/shifts/open|close`, `/pos/checkout`, `/pos/customers` (cashier), `/admin/pos/*` (reports, register setup), and barcode lookup (an exact match on the variant's `barcode` / `ean` / `upc` / `sku`, F-039).
- **Admin:**
  - a shift report (per register, per cashier, per day);
  - **Cashiers:** invite (the invite code shows on the page; no email is sent), rename, activate or deactivate (F-085);
  - **Registers:** add with a stock location and a sales channel, activate or deactivate (F-085).
- **Client apps:**
  - `pos/storefront`: the online shop on the same stock.
  - `pos/pos-app`: a Next.js PWA for tablets with login, barcode scan, cart, customer lookup, payment (cash / card / QR) and receipt. It calls the backend from its own server only (§4.2, F-040).
- **Env:**
  - `POS_CORS`: the POS app origin, applied by a CORS middleware on `/pos/*`, which the built-in CORS settings don't cover.
  - `AUTH_CORS` also includes the POS app; `ADMIN_CORS` stays admin-only.
- **Later:** offline queue, click-and-collect, in-store returns of online orders.
- **Acceptance:** a sale at a register reduces stock at that shop's location only; a shift closes with a correct cash variance.

### 6.3 Booking services — `booking-services/`

- **Built as a full copy of Ecommerce** (with PayWay, Resend, Telegram and the Cambodia rules), F-044.
- **Custom module `booking`:**
  - **`booking_resource`:** name, type staff/room/equipment/venue, capacity, timezone, is_active.
  - **`booking_schedule`:** weekday 0–6 (0 = Sunday), start_time and end_time as zero-padded `"HH:MM"` text, with database checks.
  - **`booking`:** resource_id; starts_at and ends_at in UTC; status pending/confirmed/cancelled/expired/completed/no_show; hold_expires_at; customer_id, cart_id, line_item_id, notes; reminder_sent_at.
  - **Capacity:** one booking takes one place of the resource's capacity (F-045, F-046).
- **Links:** resource ↔ product variant (many ↔ many: which services a resource offers); booking → order (many → one).
- **Service methods:** `isSlotAvailable` (overlap and capacity; pending holds count only until they expire) and `createHold`.
- **Hooks and workflows:**
  - **`addToCartWorkflow` `validate`:** the slot must be available.
  - **`add-booking-to-cart`:** creates the hold and the line item together; compensation removes the hold.
  - **`completeCartWorkflow` `validate`:** re-checks the hold. It is read-only, and a hold owned by the same cart counts, so a retried completion stays idempotent.
  - **`updateLineItemInCartWorkflow` `validate`:** blocks quantity changes on booking items above the slot's capacity. A removed item leaves its hold to expire.
  - **Subscriber `order.placed`:** confirms the bookings and links them to the order.
  - **`cancel-booking`:** applies the cancellation policy and triggers the refund.
- **Hold vs. payment:** the hold is extended when the payment session is created. If it still expires, cart completion fails, and the authorized payment is reverted automatically.
- **Jobs:** release expired holds (every minute); reminders 24 h before.
- **API routes:**
  - **Availability:** `GET /store/booking/availability`, `GET /store/booking/slots` (free slots for a service and date).
  - **Changes:** `POST /store/booking/cart` (puts a chosen slot in the cart through `add-booking-to-cart`, F-047) and `POST /store/booking/cancel`.
  - **Account:** `GET /store/customers/me/bookings` (F-049).
- **Admin:** day/week calendar per resource; walk-in booking.
- **Client app:** `booking-services/storefront`, the starter plus service pages, a slot picker, and booking management in the customer account.
- **Services are products with no shipping** (variants per duration or staff level, as in the Ticket Booking recipe). Contact for service-only carts is an email or a phone (§6.1).
- **Tickets / fixed-capacity events** (no staff calendar): follow the official Ticket Booking recipe instead (seat capacity as inventory items per show date and section).
- **Env:** `BOOKING_HOLD_MINUTES` (default 15), `BOOKING_DEFAULT_TIMEZONE`, `BOOKING_CANCEL_HOURS`.
- **Acceptance:** two customers can't hold the same slot; an abandoned checkout frees the slot automatically; a cancellation inside the policy refunds.
- **Booking-only shop (Revision 14, owner 2026-11-14, F-087).** The storefront and the demo data are booking-only: no demo goods, no Europe region or warehouse, booking wording, and a home page by booking kind. The backend stays a full copy of Ecommerce, so goods can still be sold if the shop adds them. In the admin, every bookable thing is a Medusa product (core menus stay); the **Bookings** page is the work view.
- **Booking kinds.** Each kind is one booking pattern that many businesses reuse:

  | Kind | The customer picks | Examples |
  |---|---|---|
  | **A. Appointment** (built) | a time with a person, room or court | salon, spa, clinic, tutor, photographer, car wash, sports court, karaoke room |
  | **B. Visit at your place** | a time, their address, the problem | repairs (AC, plumbing, electrical, motorbike), cleaning, pest control, installation, laundry pickup |
  | **C. Trip A → B** | pickup and drop-off address, date and time, vehicle size, extras | moving truck with helpers, airport transfer, driver or van for the day, large-item delivery |
  | **D. Scheduled departure** | a departure and a number of seats | bus, van and boat routes; city and temple tours |
  | **E. Rental by dates** | start and end date (and size or variant) | car, motorbike, equipment; wedding tents and chairs; costumes and outfits by size; guesthouse room per night |
  | **F. Event ticket** | an event date, ticket type and quantity | concerts, shows, workshops; follows Medusa's official Ticket Booking recipe (seats as inventory per date and section) |
  | **G. Table reservation** | a time and a party size, free or with a deposit | restaurant, bar, event hall |
  | **H. Event package** | one event date (or days) and many pieces booked together | weddings (venue, costumes, makeup, photographer, tents, car), parties, company events, ceremonies, tour packages |

- **Shared booking features:**
  - **Extras** on a booking (helpers, packing boxes, an extra hour, rental insurance).
  - **Deposit and balance:** pay part now and the rest later, with reminders; H can split into several payments.
  - **Quote first:** the customer asks, the shop prices it, the customer pays to confirm (moving, repairs, catering).
  - **Staff, vehicle or item assignment:** the admin assigns a driver, truck or technician; the assignee gets the job on Telegram.
  - **Reschedule** instead of cancel and rebook.
  - **Recurring bookings** (weekly cleaning), **passes** (10 classes), **waitlist** and **reviews**.
- **Trip pricing (C, D12):** three modes per service: **vehicle size + hours**, **zones** (a price table between areas), and **distance** through a maps provider. Distance needs the owner's maps account and key; without it, the other two modes work.
- **How each is built is decided in its task's research step** (DEV_FLOW §1, evidence ladder in `docs/MEDUSA_SKILL.md` §0), with Medusa's own mechanisms first: products and variants for what is sold, the Ticket Booking recipe for F, draft orders for quotes, order payment collections for balances, module links to the `booking` module, workflows and hooks. A new model or column belongs to the `booking` module (or a new custom module), never to a core table (§3.1).
- **Build order inside the revision:** shop and data (A and G) → B → C → E → D → F → shared features → H, which needs B, C, E and the shared features. Each task is one PR; the Booking staging run (P3-18) resumes after the first task, on a fresh database.
- **Acceptance (added):** each kind can be booked, paid and cancelled from the shop on staging; no two bookings take the same person, vehicle, item, seat or date beyond its capacity; a package confirms all its pieces or none.

### 6.4 Wholesale — `wholesale/`

- **Start from the official B2B starter** (`medusajs/b2b-starter`), applying the same starter changes as §4.1 and §4.2. Extend its modules; don't rebuild them.
  - **Backend:** copied from `47eecab` (the last 2.22.3 commit), then moved to 2.22.6 (F-055).
  - **Storefront:** copied from `f352e3c` (2.22.6) in P4-08.
- **Modules (from the starter, extended):**
  - **`company`:**
    - `payment_terms`: prepaid / net_15 / net_30 / net_60.
    - `credit_limit`: null = not enforced; enforced on net terms only.
    - `tax_id`.
    - `status`: pending / approved (default) / suspended; only `approved` companies buy.
  - **`employee`:** `spending_limit`, `is_admin`.
  - **`quote`** and **`approval`** (in the MVP; they come with the starter).
  - **`invoice`** (new; see Invoices).
- **Links:** employee ↔ customer (one ↔ one); company ↔ customer group (the price tier).
- **Catalog scope:** a B2B **sales channel** with its own publishable key, so the B2B storefront sees only B2B products (`pnpm seed:b2b`).
- **Who sees the catalog** (F-068, X4): with `WHOLESALE_REQUIRE_LOGIN` on (default), the Store API's product, variant and search routes answer only an employee of an **approved** company; the publishable key alone gets 401, anyone else signed in 403. The storefront's `NEXT_PUBLIC_REQUIRE_LOGIN` shows its pages to the same people and sends others to their account page, which says why.
- **Pricing:** core **price lists** of type `sale` with a customer-group rule (`customer.groups.id`) per tier. A company gets a tier by joining a customer group. Quantity tiers use each price's `min_quantity` / `max_quantity`.
- **Who may buy:** only a signed-in employee of an approved company; a guest may open an empty cart. The company of a cart or order always comes from the customer's employee record, never from cart metadata (F-059).
- **Cart rules (workflow hooks):**
  - **Adding items** (`createCartWorkflow`, `addToCartWorkflow`, `updateLineItemInCartWorkflow` `validate`): an approved company, and the minimum order quantity (`metadata.min_order_quantity` on the variant, else on its product).
  - **Checkout** (`completeCartWorkflow` `validate`): the employee's spending limit (past orders included) and the company's credit limit (outstanding = live orders minus captured).
- **Approvals:**
  - **Threshold:** `approval_settings.approval_threshold` is set by the merchant only. Above it, every switched-on approval type must be approved before checkout; with no threshold, every cart needs approval.
  - **Admin's own cart:** a company admin skips the company-admin approval, but not the sales manager's.
  - **Locked items:** a cart's items can't change while an approval is pending or approved (F-059).
- **Quotes:** `request-quote` / `accept-quote` through draft orders. Accepting a quote runs the checkout rules (own quote, approved company, spending and credit limits on the quoted total).
- **Payments:**
  - **Net-terms companies:** the built-in **system payment provider** (`pp_system_default`). The payment is captured in the admin when the invoice is paid, and the credit limit counts the order until then.
  - **Prepaid companies:** **ABA PayWay** (KHQR and cards), the Ecommerce provider (D9, task P4-12). With PayWay set up, prepaid companies must pay with it and net-terms companies by invoice: checked when a payment session starts and at cart completion. Without PayWay keys, everyone pays by invoice.
  - **One order at a time per company:** cart completion and quote acceptance run inside a lock on the company, so two checkouts can't both use the last of the credit (B6). Every placed order is linked to its company, so it keeps counting against the credit after its buyer leaves (B4, B5).
- **Invoices:**
  - **Module `invoice`:** numbers `INV-000001`, one per order, with a snapshot of the company, tax ID and terms, and a due date from the terms.
  - **PDF:** `pdfmake`, following the official invoice tutorial pattern. It is at `GET /admin/orders/:id/invoice` and `GET /store/orders/:id/invoice` (the buyer or their company admin only); `GET /store/invoices` lists what's due.
  - **Language:** every label in English and Khmer, font Kantumruy Pro (SIL OFL; D10, P4-13, F-070). USD and KHR print their sign, other currencies their code.
  - **Dates:** issued when the order is placed, or when a quote is accepted; a cancelled order is listed with nothing due (B2, B3).
  - **Seller details:** from `INVOICE_SELLER_*`.
- **API routes:**
  - **Company:** `/store/companies/me` and `/store/companies/me/employees`. They take the company and role from the customer's employee record; the starter's `/store/companies/:id…` routes are removed (F-058).
  - **Quotes:** `/store/quotes`.
  - **Sign-up:** creates the company and its first admin together.
  - **Colleagues join with consent** (B14): a company admin asks for a **join code** for an email (`POST /store/companies/me/employees` `{ email }`); the colleague, signed in with that email, joins with it (`POST /store/companies/join`). Nobody is added by id.
- **Client app:** `wholesale/storefront` (from the `b2b-starter` storefront `f352e3c`, P4-08), a B2B buyer shop behind login (`NEXT_PUBLIC_REQUIRE_LOGIN`): quick order by SKU or CSV, reorder, invoices, quotes, company users and join codes. The starter's catalog for AI agents (UCP, `/buy`, `llms.txt`, sitemap) is off while login is required (F-068).
- **Env:**
  - **Approval:** `WHOLESALE_REQUIRE_APPROVAL` (`true` = a company that signs up in the storefront starts `pending`; companies the admin creates start `approved`).
  - **Invoices:** `INVOICE_SELLER_NAME`, `INVOICE_SELLER_ADDRESS`, `INVOICE_SELLER_TAX_ID`, `INVOICE_SELLER_EMAIL`, `INVOICE_SELLER_PHONE`, `INVOICE_PAYMENT_NOTE`.
  - **Catalog:** `WHOLESALE_REQUIRE_LOGIN` (default on; F-068).
  - **Payments:** `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_API_URL`, `PAYWAY_RETURN_URL` (P4-12), and `pp_payway_payway` enabled on the region.
- **Optional:** ERP integration exactly as in the official ERP recipe.
- **Acceptance:** a Gold company sees Gold prices; an employee over their limit can't complete checkout, and neither can a company over its credit limit.

### 6.5 Reseller — `reseller/`

- **Built as a full copy of Ecommerce** (`reseller/backend` and `reseller/storefront`, F-061). `reseller/seller-portal` is a plain Next.js app (§4.2).
- **Custom module `seller`:**
  - **`seller`:**
    - `handle`: URL-safe.
    - `name`, `email`.
    - `domain`: a lowercase host, unique.
    - `status`: pending / active / suspended; only `active` sellers earn.
    - `commission_rate`: a percent from 0 to 100; null = `RESELLER_DEFAULT_COMMISSION_RATE` (F-062).
  - **`seller_commission`:** `order_id` (unique), `order_total`, `rate`, `amount`, `currency_code`, status pending / approved / paid / cancelled, `paid_at`.
- **Links:** seller ↔ sales channel (one ↔ one; the seller's storefront publishable key). Creating a seller (`createSellerWorkflow`) also creates their channel and key.
- **Commissions:**
  - **Recording:** `record-seller-commission`, triggered by subscriber `order.placed`. It goes order → sales channel → seller → commission and ignores channels without an active seller. It writes one commission per order, guarded by a lock and the unique `order_id`, so a repeated event creates no second one.
  - **Base:** the order's items after discounts, without tax and shipping (`item_total − item_tax_total`; D11, P5-12; the first build used the order total, F-063). `order_total` stores this base.
  - **Cancels and refunds:** an order cancel cancels the commission. A refund keeps the share of the order the shop kept, measured against the captured amount (an order's `total` goes down after a refund); cancelled at 0. A paid commission isn't changed by either, and payouts take the same per-order locks as refunds (B10).
- **Payouts (manual, D11, F-064):**
  - **Payout day:** on `RESELLER_PAYOUT_DAY` (1–28, UTC), a job approves last month's pending commissions.
  - **What's due:** `GET /admin/seller-payouts` reports it.
  - **Paying:** the shop pays outside Medusa and records it with `POST /admin/sellers/:id/payouts` (approved → paid).
  - **Later:** a `seller_payout` record, once statements are needed.
- **Seller auth:** a custom actor type **`seller`** (`/auth/seller/emailpass`; `/sellers/*` routes behind `authenticate("seller", ["session", "bearer"])`).
  - **Invite-only, like POS cashiers:** the shop creates the seller (`POST /admin/sellers`, which returns an **invite code**), and the seller registers, accepts with that code (`POST /sellers/accept` `{ invite_code }`) and signs in. The invited email alone can't take the account (B11).
  - **Suspended sellers** are locked out at once.
  - **CORS:** `/sellers/*` isn't covered by the built-in CORS settings, so a middleware reading `SELLER_CORS` covers it.
- **API routes:**
  - **Seller account:** `/sellers/me`.
  - **Products:** `/sellers/me/products` (choose which of your published products appear in the seller's channel; sellers don't set prices).
  - **Sales:** `/sellers/me/orders` (no customer details) and `/sellers/me/commissions` (with totals per status).
  - **Domain lookup:** `GET /store/sellers/resolve` (domain or handle → an active seller's publishable key).
- **Client apps:**
  - **`reseller/storefront`:** one multi-tenant deployment for every seller domain.
    - **Seller lookup:** on the server, from the `Host` header (not `x-forwarded-host`), with `SELLER_RESOLVE_MODE` and `DEFAULT_SELLER_HANDLE`. The domain → key result is cached.
    - **Seller key per request:** sent as the `x-publishable-api-key` header inside the starter's `sdk.client.fetch` wrapper (`src/lib/config.ts`). The build-time `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` is only the shop's own key.
    - **Data cache:** Next.js keeps it per key, because its cache key includes the headers.
    - **Browser search** on a seller's domain needs that origin in `STORE_CORS` (a regex works for subdomains, e.g. `/\.yourplatform\.com$/`).
  - **`reseller/seller-portal`:** product selection, sales and commissions. It calls the backend from its own server only (sealed session cookie), so it needs neither `SELLER_CORS` nor `AUTH_CORS`; `SELLER_CORS` stays for a browser-side client.
- **Env:** backend `RESELLER_DEFAULT_COMMISSION_RATE` (default 10), `RESELLER_PAYOUT_DAY` (default 1), `SELLER_CORS`; storefront `SELLER_RESOLVE_MODE`, `DEFAULT_SELLER_HANDLE`.
- **Acceptance:** an order in a seller's channel creates exactly one commission, even when the event is delivered twice; orders from your own channel create none.

### 6.6 Marketplace — `marketplace/`

- **Starting point:** `marketplace/backend` and `marketplace/storefront` are a full copy of Ecommerce (owner, F-072), like POS, Booking and Reseller. `marketplace/vendor-portal` is a copy of the Reseller seller portal.
- **Custom module `marketplace`:**
  - `vendor`: handle, name, email, logo, status (pending / active / suspended; the admin's approval makes it active), commission_rate (null = `MARKETPLACE_DEFAULT_COMMISSION_RATE`)
  - `vendor_admin`: email (unique across vendors, stored lowercased), names
  - `vendor_payout`: amount, currency, status (pending / paid / cancelled), period (calendar month `YYYY-MM`, UTC; one payout per vendor, period and currency), paid_at, reference
  - `vendor_commission`: one per child order; order total, base (items after discounts, without tax and shipping, as Reseller D11), rate, amount, what the vendor is owed (order total − amount), status (pending / approved / paid / cancelled), and `refund_review` (none / to_review / settled) (F-078)
- **Links:** vendor → products, vendor → orders (child orders), vendor → stock locations.
- **Vendor auth:** a custom actor type `vendor`, as in the official Vendors example:
  - **Sign-up:** `/auth/vendor/emailpass/register` → `create-vendor` workflow with `setAuthAppMetadataStep` → `authenticate("vendor", ["session", "bearer"])`, then admin approval. Vendors sign up themselves; nothing works until the admin approves.
  - **The vendor admin's email** comes from the auth identity, never from the request body (F-074). Emailpass matches the email exactly as registered, case included.
  - **Vendor routes** live under `/vendors/*`, and every query is filtered by the signed-in vendor.
  - **CORS:** a middleware reading `VENDOR_CORS` covers `/vendors/*`.
- **Workflows:**
  - **`create-vendor`.** Approving a vendor also gives it its own stock location in the store's default sales channel (F-080).
  - **`create-vendor-product`:** links the product to the vendor and gives it the default shipping profile. A vendor may send `draft` (default) or `proposed`; `published` only when `MARKETPLACE_REQUIRE_PRODUCT_APPROVAL=false`; never `rejected` (F-075). The admin approves by publishing it.
  - **`create-vendor-orders`:**
    - **Route:** a custom `POST /store/carts/:id/complete-vendor`, which the storefront calls instead of the core complete-cart route. It calls `completeCartWorkflow` (the parent order) inside `acquireLockStep` / `releaseLockStep` on the cart id, then runs the split.
    - **The split (`split-vendor-order`)** runs per order, locked on the order id and idempotent (it checks for existing links first). It runs from `complete-vendor` and from an `order.placed` subscriber, so an order Medusa completes itself (the PayWay webhook) still gets its vendor orders (F-079).
    - **Child orders:** one per vendor, even when the cart has a single vendor, so the parent is never a vendor's order (F-076). They are made with the Order Module's `createOrders` as copies of the parent's items (prices, tax lines, discounts), and the parent's stock reservations move to the child items; `createOrderWorkflow` is not used, because it fails when an order takes a variant's last units (F-077). Child orders keep the email and addresses but no customer id, so they don't show in the customer's account. Compensation deletes the child orders.
    - **Shipping is split across vendors** (owner, F-076): each child gets the parent's shipping amounts and shipping discounts times its share of the items' value, rounded to cents; the last child takes the rounding rest, so the children add up to the parent.
  - **`record-vendor-commission`:** one commission per child order, at the vendor's rate. A cancelled child order cancels its commission before payout.
  - **`create-payouts`** (a daily job that pays on `MARKETPLACE_PAYOUT_DAY` for the month before).
- **Parent vs. child orders:** payment lives on the parent order, and vendors fulfil child orders only. The admin order page shows the split (a widget), there is a vendor orders list, and reports count child orders only.
- **Payouts:** manual payouts from a report, as Reseller does. Automate only if the payment provider supports split payments.
- **Refunds (owner: "hold and flag now, automate later", F-078):** refunds are taken on the parent order, which holds the payment. A pending commission whose parent order has a refund is held out of payouts and flagged `to_review` (a `payment.refunded` subscriber, and the payout job checks again). The admin settles it in the payout report's *Refunds to review* section: keep, reduce what the vendor gets, or cancel; the next payout includes a kept or reduced one. A refund after a payout is settled by hand. **Later**, if refunds become common: split each refund across the vendors by share, as Reseller does.
- **Vendor stock (owner: "track it", F-080):** a vendor's product starts with the quantity the vendor gives, at the vendor's own stock location; the portal shows and edits "quantity in stock". Checkout refuses what is out of stock; the reservation is made at the vendor's location and fulfilment takes it from there. "Track stock" off (`manage_inventory: false`) is a per-product setting for made-to-order items.
- **Admin:** vendor approval queue, product moderation, payout report with *Refunds to review*, vendor orders list, order split widget.
- **Client apps:**
  - `marketplace/storefront`: shows "Sold by" and vendor shop pages, and places orders through `complete-vendor`.
  - `marketplace/vendor-portal`: products (with stock), orders, fulfilments, payouts. It calls the backend from its own server, like the seller portal.
- **Env:** `MARKETPLACE_DEFAULT_COMMISSION_RATE`, `MARKETPLACE_REQUIRE_PRODUCT_APPROVAL`, `MARKETPLACE_PAYOUT_DAY`, `VENDOR_CORS`.
- **Acceptance:** a cart with items from two vendors produces two child orders that each vendor sees and fulfils separately; payouts equal order totals minus commission.

---

## 7. Recommended build order

| Phase | Deliverable | Size | Depends on | Why this position |
|---|---|---|---|---|
| **0. Foundation** | Backend and web client standards (§4) proven in `ecommerce/`: backend and storefront deployed to Dokploy (server, worker, storefront); `update-medusa.sh`, `verify.sh`, `guard.sh`; CI matrix; local stack | M | — | Proves R1–R4 and independent deploys before business logic exists. |
| **1. Ecommerce** | `ecommerce/backend` and `storefront`, production MVP | S | 0 | The core every other scenario builds on; fastest path to a live, earning project. |
| **2. POS** | `pos/backend`, `storefront`, `pos-app` | M | 1 | Reuses Ecommerce; adds registers, shifts and the first non-storefront client. |
| **3. Booking services** | `booking-services/backend` and `storefront`; Revision 14 adds the booking-only shop and kinds B–H (P3-19 to P3-30) | L | 1 | First scenario that hooks into core cart flows; hold and expiry logic must be solid. |
| **4. Wholesale** | `wholesale/backend` and `storefront` | M | 1 | Mostly core price lists, the starter's modules and checkout validation hooks. |
| **5. Reseller** | `reseller/backend`, `storefront` (multi-tenant), `seller-portal` | M–L | 1 | First partner portal and money owed to partners; reuses the cashier actor pattern. |
| **6. Marketplace** | `marketplace/backend`, `storefront`, `vendor-portal` | L | 1, 5 | Hardest: vendor actor, order splitting, payouts, moderation. Built last, so the actor, portal and commission patterns are proven in 5. |

Rules for the order:

- **Phases 2–5 may be reordered by business priority.** Phases 0 and 1 always come first; Phase 6 always comes after Phase 5.
- **Inside each phase:** backend first, then storefront, then portal or app. A client starts only once the backend API it needs exists.
- **Each phase ends with:**
  - the CI gate green for every deployable in the category
  - the whole category deployed to a Dokploy staging project, using only its committed `Dockerfile`s and `.env.example`s
  - one Medusa update done with `scripts/update-medusa.sh`
  - each app redeployed alone once, to prove independence
- **Don't start two "L" phases at the same time.**
- **Staging may wait (owner; F-034, F-044):** a phase's code can be finished and merged while its staging run and exit checklist wait for the owner. Those items stay open in `docs/TASKS.md` and are done before that category goes live.

**Status 2026-11-14:**
- Phase 0: done.
- Phase 1: on staging; production waiting (P1-08, P1-09).
- Phase 2: on staging, exit P2-14 passed (2026-11-14).
- Phase 3: Revision 14 (booking kinds) being built, P3-19 to P3-30; staging and exit P3-18 after P3-19.
- Phases 4, 5 and 6: code done; staging and exit waiting (P4-11, P5-11, P6-13).
- The first full review's 29 findings and four later ones are fixed (2026-11-12).

## 8. Update and release process

```
scripts/update-medusa.sh <category|category/app|all> [version] [--pnpm-latest]   # default: npm latest
```

For each deployable, the script:

1. Reads the target version (`npm view @medusajs/medusa version` when none is given).
2. Sets every `@medusajs/*` dependency on the Medusa release line (the backend **and** that category's clients) to that exact version, and `@medusajs/ui` to the version the dashboard depends on (§3.2). With `--pnpm-latest` it also moves `packageManager` to the latest pnpm.
3. Runs `pnpm install` → a new `pnpm-lock.yaml` (and `minimumReleaseAgeExclude` entries on release day, §3.2).
4. Runs `scripts/verify.sh <category>`:
   - `pnpm build`, then `pnpm typecheck`
   - unit and integration tests
   - fresh Postgres: `medusa db:migrate`, start, `GET /health` = 200, `GET /app` = 200
   - clients: `pnpm build` of each storefront, portal and app against the updated backend
   - with `--image`: build the image and smoke-test `/health`
5. On success, commits `package.json` and `pnpm-lock.yaml` for that category only.

**Release:**

0. **Pre-deploy audit:** before a category's first staging or production deploy, run `docs/PRE_DEPLOY_AUDIT.md` for it.
   - **What it checks:** 10 checks (authorization, reset tokens, input, CORS, rate limits, errors, indexes, logging, secrets, rollback), plus `pnpm audit --prod`.
   - **Report:** goes in `<category>/AUDIT-<date>.md`, and every FIX becomes a `docs/TASKS.md` task.
   - **Going live:** a category goes live only when every row is PASS, N/A or an owner-accepted RISK.
1. **Release notes:** read them for every version skipped (breaking changes are called out there), and run any codemod they list.
2. **Back up the database.** The official revert is `medusa db:rollback <module…>` for each module that migrated, then reinstalling the old versions; the backup is the fallback. The daily backups (§5) run regardless.
3. **Removed or changed links and search indexes:** run `medusa db:sync-links --execute-all` / `medusa db:migrate:search --execute-all-search` by hand from the Dokploy terminal, after reviewing the plan they print.
4. **Deploy:** to staging with **one** server replica, smoke test, then production.
5. **Rollback:** redeploy the previous commit or image **plus** `db:rollback` of the migrated modules, or restore the backup.

**Automation:**
- **No Dependabot or Renovate:** Dependabot supports pnpm v7–v10 only, and this repo pins pnpm 12 (F-008).
- **The weekly check:** `.github/workflows/medusa-update-check.yml` (Mondays 02:00 UTC, also runnable by hand) fails visibly when any deployable pins an older Medusa than npm `latest`.
- **Updating:** a human then runs `scripts/update-medusa.sh <category>` on a branch, and CI checks the PR.
- **Deploying:** merging redeploys only the changed deployables (Dokploy watch paths).

**Before every merge** (owner rule, DEV_FLOW §7.1): check the diff against `docs/MEDUSA_SKILL.md` and update every related document. The required CI check is `ci-ok`, and PRs squash-merge.

### 8.1 Starter updates

The starters are copied, not installed. Each backend and client README records the starter commit it came from. To take upstream improvements:
1. Diff the starter between the recorded commit and its latest commit.
2. Apply the relevant parts by hand.
3. Update the recorded commit.

Medusa package updates for clients go through the update script.

**Starter syncs so far:**
- **2026-11-06:** every web client took the `dtc-starter` Next.js 16 migration (`6b95717`), on Next.js 16.4.5 (V-04).
- **2026-11-09:** both starters moved to Medusa 2.22.6.
- **2026-11-10:** every app followed (V-06).

## 9. Verified technical notes

A throwaway prototype on Medusa 2.21.1 and pnpm 12.6.0 tested this plan before Phase 0. These findings still hold. `docs/MEDUSA_SKILL.md` has the full, per-version reference.

| Topic | Finding |
|---|---|
| pnpm 12 and `.npmrc` | The starter's `public-hoist-pattern` lines in `.npmrc` are **ignored**. Put `publicHoistPattern` in the app's `pnpm-workspace.yaml`. |
| pnpm 12 install scripts | Install fails with `ERR_PNPM_IGNORED_BUILDS` until `allowBuilds` is set (`@swc/core`, `esbuild`, `msgpackr-extract`, `protobufjs`; telemetry can be `false`). |
| `medusa build` output | `.medusa/server` has `package.json` but **no lockfile**; copy `pnpm-lock.yaml` and `pnpm-workspace.yaml` in before `pnpm install --prod --frozen-lockfile`. |
| Typecheck | `tsc --noEmit` needs `.medusa/types`, which the build generates, so run the build before typecheck. New link aliases are typed only after `pnpm build`. |
| Migrations | `medusa db:generate <module>` needs a reachable database. Commit the migration and the `.snapshot-*.json`. For starter modules with no usable snapshot, first generate with the *unchanged* model, delete that migration but keep the snapshot, then change the model and generate again. |
| Linkable names | `Module.linkable.<camelCase of the model name>`: `booking_resource` → `linkable.bookingResource`. A link without `isList` is one-to-one. |
| Service method names | Generated from the **object keys** passed to `MedusaService({...})`: key `Resource` → `createResources`. |
| Workflows | Returning `when(...).then(...)` directly in `WorkflowResponse` fails typecheck; wrap it: `new WorkflowResponse({ result })`. A failed `run()` rejects with a plain object, not an `Error`. |
| Signed-in user | Read `req.auth_context.actor_id`, not `app_metadata.<x>_id`. |
| Body validation | Opt-in per route: `.strict()` schemas and `req.validatedBody`. |
| Redis modules | Workflow engine options are `{ redis: { redisUrl } }` (`url` deprecated since v2.12.2). The Caching Module needs `MEDUSA_FF_CACHING=true` and `@medusajs/caching-redis`. |
| S3 provider options | `file_url`, `access_key_id`, `secret_access_key`, `region`, `bucket`, `endpoint`, `additional_client_config` (e.g. `forcePathStyle` for MinIO). |

---

## 10. Decisions and risks

**Decisions** (evidence in `docs/TASKS.md` → *Decisions log*)

| # | Decision | Choice | Decided |
|---|---|---|---|
| D1 | Payment providers per project; split payments | **ABA PayWay** (cards, ABA Pay, KHQR) as a custom provider for Ecommerce and its copies (F-022). POS records cash / card / QR through `pp_system_default`. Split payments: none so far; Reseller and Marketplace pay out manually. | 2026-09-27 |
| D2 | Notification channels | Customer email through **Resend**; staff alerts through a **Telegram** bot; order updates through a second Telegram bot to customers who opt in | 2026-09-27 |
| D3 | File storage | **S3** or an S3-compatible server (staging: RustFS; SeaweedFS also tested) | 2026-09-25 |
| D4 | Storefront design | Keep the starter's look for now; restyle later | 2026-09-27 |
| D5 | POS app | **Next.js PWA**. Switch to React Native only if hardware (printer, scanner, card reader) needs native access; that app would ship through app stores, not Dokploy | 2026-10-15 |
| D6 | Staging | A separate Dokploy project `<category>-staging` with its own databases, Redis, bucket and domains | 2026-09-25 |
| D7 | Next.js 16 | Every web client on 16.4.5 with the starters' migration (§4.2, §8.1) | 2026-11-06 |
| D8 | "App down" alerts | **Open, needed before production:** which uptime monitor runs outside the Dokploy server (recommended: a hosted monitor alerting the staff Telegram) | — |
| D9 | Wholesale payment for prepaid companies | **ABA PayWay** (KHQR, cards); net terms stay on `pp_system_default` (P4-12) | 2026-11-11 |
| D10 | Wholesale invoice language | **Khmer and English**, with an embedded Khmer font (P4-13) | 2026-11-11 |
| D12 | Booking trip pricing (kind C) | **All three modes:** vehicle size + hours, zones, and distance through a maps provider (the owner's account and key; optional) | 2026-11-14 |
| D11 | Reseller commission base and payouts | **Items only** (after discounts, no tax or shipping; P5-12); **payouts stay manual** | 2026-11-11 |

Also decided for Ecommerce:
- **Delivery:** Phnom Penh delivery at launch; more shipping options can be added later in the admin.
- **Contact:** phone first; email and Telegram optional.
- **Backups:** daily backups with a restore test before go-live.

**Risks**

| # | Risk → mitigation | When |
|---|---|---|
| R-a | A Medusa minor release with a breaking change → caught by the CI gate; may need code changes before updating | ongoing |
| R-b | A migration is applied, then a rollback is needed → `db:rollback` or a backup restore | every release |
| R-c | Duplicated boilerplate drifts between folders → `guard.sh` checks the shared rules in every app (exact pins, `packageManager`, safe-mode entrypoint, no demo seeds in migration scripts); copies record their source commit | ongoing |
| R-d | A client is built with an old publishable key or backend URL → they are build args, so changing them means rebuilding that client (documented in each `.env.example`) | ongoing |
| R-e | The worker and the server both run migrations → the worker env always has `RUN_MIGRATIONS=false` | every deploy |
| R-f | Official starters or recipes change → re-check docs.medusajs.com and the starter repos at the start of every phase, not only package versions | every phase |
| R-g | No usable admin roles → every admin user has full access, so cashiers, sellers and vendors never get admin users (custom actor types). RBAC is behind `MEDUSA_FF_RBAC`, enabling it isn't documented, and since 2.22 it needs a paid `MEDUSA_LICENSE_KEY` (F-001, F-035, F-042) | every phase |
| R-h | Two server replicas migrating at once (only per-module advisory locks, F-004) → scale to 1 during deploys | every deploy |
| R-i | Advisories inside `@medusajs/*` that Medusa's own ranges can't fix yet (after 2.22.6: only `zod` 4.2.0, pinned by the starter) → accepted as low risk and re-checked on every update (§3.2, E-A6) | every update |
| R-j | Apps on different Medusa versions drift apart (all on 2.22.6 since 2026-11-10) → `docs/MEDUSA_SKILL.md` records facts per version; older apps move forward with `update-medusa.sh` | ongoing |
| R-k | Flaky tests block unrelated PRs → tests control or wait for background work (§3.3, F-065) | ongoing |

---

## Revision history

| Rev | Date | What changed |
|---|---|---|
| 14 | 2026-11-14 | Booking services become a booking-only shop with kinds A–H (appointment, visit at your place, trip A → B incl. moving, scheduled departure, rental by dates incl. costumes, event ticket, table reservation, event package incl. weddings) and shared features (extras, deposit, quote first, assignment, reschedule, recurring, passes, waitlist, reviews), §6.3; build order and status §7; D12 trip pricing. TASKS F-087, P3-19 to P3-30. |
| 13 | 2026-11-13 | POS admin pages Cashiers and Registers (§6.2), so staging Step 7.B needs no `curl`. TASKS F-085. |
| 12 | 2026-11-12 | Marketplace as built (P6-01 to P6-15): full Ecommerce copy, `vendor_commission`, statuses and uniqueness, vendor email from the auth identity, product statuses, child orders via the Order Module with moved reservations, split per order (also from `order.placed`), shipping split across vendors, refunds held and flagged, vendor stock locations. Status line. TASKS F-072 to F-080. |
| 11 | 2026-11-12 | Wholesale as built after P4-08 to P4-13 and the review fixes: catalog for employees of approved companies (`WHOLESALE_REQUIRE_LOGIN`), join codes, PayWay for prepaid companies, one order at a time per company, bilingual invoices. Reseller: commission base and refund share, payout locks. POS and Reseller: invite codes. Status line, pnpm 12.18.0. TASKS F-066 to F-070, D9 to D11. |
| 10 | 2026-11-12 | Builder documents moved into `docs/` (owner request, F-071): §2 tree, R5 and every path. `BUILD_PLAN.md` and `CLAUDE.md` stay at the root. |
| 9 | 2026-11-11 | Clean rewrite: one current description per topic, history moved here. Versions 2.22.6 / `@medusajs/ui` 4.2.13. Wholesale (§6.4) and Reseller (§6.5) as built. Decisions D9–D11. pnpm release-age rule (§3.2) and flaky-test rule (§3.3, R-k). TASKS F-055 to F-065, V-06. |
| 8 | 2026-11-06 | Versions 2.22.3; apps may sit on different Medusa versions (F-044); plan lock hook (F-054); local Podman stacks (F-043, F-050 to F-052); POS and Booking details (F-036 to F-049); pre-deploy audit, alerts, `pnpm audit` triage. |
| 7 | 2026-10-15 | Re-check of Medusa 2.21.2 and the starters (F-034, F-035); RBAC still flag-only; Phase 2 started before the Ecommerce production deploy, POS copied from Ecommerce. |
| 6 | 2026-10-04 | Medusa 2.21.2; Cambodia contact rules; Telegram order updates (`telegram_links`); PayWay as built; daily backups with a restore test; server hardening. |
| 5 | 2026-09-29 | Cambodia addresses and phone format; decisions D1–D4; ABA PayWay instead of Stripe; `@medusajs/ui` pinned to the dashboard's version; Dokploy form values; seed-based first deploy; weekly update check instead of Dependabot; storefront changes 7–9 (F-002 to F-028). |
| 4 | 2026-09-25 | Technical review against Medusa 2.21.1: non-interactive `db:migrate`; built-in Search Module; cashier actor type; Wholesale from `b2b-starter`; per-request publishable key for Reseller; booking line-item guard; `db:rollback` in the release process. |
| 3 | 2026-09-25 | Audit against the docs and starters: `dtc-starter`; Caching Module; `redisUrl`; `NEXT_PUBLIC_MEDUSA_BACKEND_URL`; recipes for marketplace, POS and booking. |
| 2 | 2026-09-24 | Every category is a full business project with one sub-folder per deployable, each with its own `Dockerfile` and `.env.example`. |
| 1 | — | First pre-build plan. |
