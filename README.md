# medusa-apps

Standalone [Medusa](https://medusajs.com) backends, one per commerce scenario, each deployable on its own with Dokploy.

> **Status (2026-11-05): Phase 1 (ecommerce) built and running on staging; production deploy is next. Phase 2 (POS) and Phase 3 (booking-services) code is done and passed local Podman smoke + e2e; their staging and exit checklists wait on the owner.** Wholesale, reseller and marketplace have deployment templates only (Dockerfile + env per deployable). Progress is tracked in [`TASKS.md`](./TASKS.md); requirements are in [`BUILD_PLAN.md`](./BUILD_PLAN.md).

Each folder is **one business project** (one Dokploy project). Inside it, every deployable has its own `Dockerfile` and `.env.example` and deploys independently.

| Folder | Scenario | Deployables (Dokploy Build Path) | Status |
|---|---|---|---|
| [`ecommerce/`](./ecommerce) | Direct-to-consumer online store | `/ecommerce/backend`, `/ecommerce/storefront` | Built, on staging — Phase 1 (production pending) |
| [`pos/`](./pos) | Physical shop checkout | `/pos/backend`, `/pos/storefront`, `/pos/pos-app` | Built — Phase 2 (staging deferred by the owner) |
| [`booking-services/`](./booking-services) | Appointments, classes, tickets, rentals | `/booking-services/backend`, `/booking-services/storefront` | Built — Phase 3 (copy of Ecommerce on Medusa 2.22.2; exit P3-18 pending) |
| [`wholesale/`](./wholesale) | Sellers buy your products in bulk | `/wholesale/backend`, `/wholesale/storefront` | Planned — Phase 4 |
| [`reseller/`](./reseller) | Sellers sell your products, you ship | `/reseller/backend`, `/reseller/storefront`, `/reseller/seller-portal` | Planned — Phase 5 |
| [`marketplace/`](./marketplace) | Vendors sell their own products | `/marketplace/backend`, `/marketplace/storefront`, `/marketplace/vendor-portal` | Planned — Phase 6 |

Each category's `README.md` is its Dokploy guide: services, build paths, ports, env and first-deploy order.

Outside `ecommerce/`, the `Dockerfile`s and `.env.example`s are committed **ready templates**; app code is added in each category's build phase, so those folders can't be deployed yet.

## Documents

- [`COMPARISON.md`](./COMPARISON.md) — side-by-side comparison of all scenarios and when each fits.
- [`BUILD_PLAN.md`](./BUILD_PLAN.md) — requirements, repo rules, app standard, Dokploy plan, per-scenario plans, **recommended build order**, update process. **Frozen.**
- [`TASKS.md`](./TASKS.md) — development phases with a checklist per task (the living tracker).
- [`MEDUSA_SKILL.md`](./MEDUSA_SKILL.md) — verified Medusa reference (2.21.2, plus 2.22.2 for `booking-services/`) with sources; the only Medusa knowledge builders may use without a fresh lookup.
- [`DEV_FLOW.md`](./DEV_FLOW.md) — build → verify → test → evidence-based fix cycle → commit → push.
- [`CLAUDE.md`](./CLAUDE.md) — builder entry point: reading order and non-negotiable rules.
- [`docs/PLAN_LOCK.md`](./docs/PLAN_LOCK.md) — owner's note: the commands to unlock and lock `BUILD_PLAN.md` for Claude.

## Principles

1. **Official Medusa only.** Medusa is used as published npm packages. Nothing upstream is forked or patched.
2. **Update any time, safely.** Exact version pins, a lockfile per app, and a CI gate every update must pass before deploy.
3. **Not a monorepo.** Every deployable (backend, storefront, portal, app) is independent: own `package.json`, lockfile, `Dockerfile`, `.env.example`. Nothing is shared; clients reach their backend only over HTTP.
4. **One business = one app.** Combine scenarios by adding modules to one app, never by syncing two apps.

Versions (checked 2026-11-06): Medusa 2.21.2 (`ecommerce/`, `pos/`) and 2.22.2 (`booking-services/`), Next.js 15.5.28, pnpm 12.6.0, Node `>=22.22.0`. Upstream: Medusa 2.22.3 (npm `latest`, starters on it, Node `>=22.23.4`), starter storefronts on Next.js 16. Details and update plan: `BUILD_PLAN.md` Revision 8. Starters: `medusajs/dtc-starter`, `medusajs/b2b-starter`.
