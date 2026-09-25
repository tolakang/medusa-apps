# medusa-apps

Standalone [Medusa](https://medusajs.com) backends, one per commerce scenario, each deployable on its own with Dokploy.

> **Status: planning.** No application code yet; deployment templates (Dockerfile + env per deployable) are in place. Start with [`BUILD_PLAN.md`](./BUILD_PLAN.md).

Each folder is **one business project** (one Dokploy project). Inside it, every deployable has its own `Dockerfile` and `.env.example` and deploys independently.

| Folder | Scenario | Deployables (Dokploy Build Path) | Status |
|---|---|---|---|
| [`ecommerce/`](./ecommerce) | Direct-to-consumer online store | `/ecommerce/backend`, `/ecommerce/storefront` | Planned — Phase 1 |
| [`pos/`](./pos) | Physical shop checkout | `/pos/backend`, `/pos/storefront`, `/pos/pos-app` | Planned — Phase 2 |
| [`booking-services/`](./booking-services) | Appointments, classes, tickets, rentals | `/booking-services/backend`, `/booking-services/storefront` | Planned — Phase 3 |
| [`wholesale/`](./wholesale) | Sellers buy your products in bulk | `/wholesale/backend`, `/wholesale/storefront` | Planned — Phase 4 |
| [`reseller/`](./reseller) | Sellers sell your products, you ship | `/reseller/backend`, `/reseller/storefront`, `/reseller/seller-portal` | Planned — Phase 5 |
| [`marketplace/`](./marketplace) | Vendors sell their own products | `/marketplace/backend`, `/marketplace/storefront`, `/marketplace/vendor-portal` | Planned — Phase 6 |

Each category's `README.md` is its Dokploy guide: services, build paths, ports, env and first-deploy order.

The `Dockerfile`s and `.env.example`s are committed **ready templates**; app code is added in the build phase, so these folders can't be deployed yet.

## Documents

- [`COMPARISON.md`](./COMPARISON.md) — side-by-side comparison of all scenarios and when each fits.
- [`BUILD_PLAN.md`](./BUILD_PLAN.md) — requirements, repo rules, app standard, Dokploy plan, per-scenario plans, **recommended build order**, update process. **Frozen.**
- [`TASKS.md`](./TASKS.md) — development phases with a checklist per task (the living tracker).
- [`MEDUSA_SKILL.md`](./MEDUSA_SKILL.md) — verified Medusa 2.21.1 reference with sources; the only Medusa knowledge builders may use without a fresh lookup.
- [`DEV_FLOW.md`](./DEV_FLOW.md) — build → verify → test → evidence-based fix cycle → commit → push.
- [`CLAUDE.md`](./CLAUDE.md) — builder entry point: reading order and non-negotiable rules.

## Principles

1. **Official Medusa only.** Medusa is used as published npm packages. Nothing upstream is forked or patched.
2. **Update any time, safely.** Exact version pins, a lockfile per app, and a CI gate every update must pass before deploy.
3. **Not a monorepo.** Every deployable (backend, storefront, portal, app) is independent: own `package.json`, lockfile, `Dockerfile`, `.env.example`. Nothing is shared; clients reach their backend only over HTTP.
4. **One business = one app.** Combine scenarios by adding modules to one app, never by syncing two apps.

Baseline (checked 2026-09-25 against docs.medusajs.com): Medusa 2.21.1, pnpm 12.6.0, Node 22 LTS. Starters: `medusajs/dtc-starter`.
