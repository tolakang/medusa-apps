# medusa-apps

Standalone [Medusa](https://medusajs.com) backends, one per commerce scenario, each deployable on its own with Dokploy.

> **Status (2026-11-12):** Phase 1 (Ecommerce) built and on staging; production (P1-08) is next. Phases 2 to 6 (POS, Booking services, Wholesale, Reseller, Marketplace) have their code done; their staging runs and exit checklists (P2-14, P3-18, P4-11, P5-11, P6-13) wait for the owner. Details: [`docs/TASKS.md`](./docs/TASKS.md) → *Session handoff*.

Each folder is **one business project** (one Dokploy project). Inside it, every deployable has its own `Dockerfile` and `.env.example` and deploys independently.

| Folder | Scenario | Deployables (Dokploy Build Path) | Status |
|---|---|---|---|
| [`ecommerce/`](./ecommerce) | Direct-to-consumer online store | `/ecommerce/backend`, `/ecommerce/storefront` | Built, on staging — Phase 1 (production pending) |
| [`pos/`](./pos) | Physical shop checkout | `/pos/backend`, `/pos/storefront`, `/pos/pos-app` | Built — Phase 2 (staging and exit P2-14 wait for the owner) |
| [`booking-services/`](./booking-services) | Appointments, classes, tickets, rentals | `/booking-services/backend`, `/booking-services/storefront` | Built — Phase 3 (copy of Ecommerce; exit P3-18 pending) |
| [`wholesale/`](./wholesale) | Sellers buy your products in bulk | `/wholesale/backend`, `/wholesale/storefront` | Built — Phase 4 (exit P4-11 waits for the owner) |
| [`reseller/`](./reseller) | Sellers sell your products, you ship | `/reseller/backend`, `/reseller/storefront`, `/reseller/seller-portal` | Built — Phase 5 (exit P5-11 waits for the owner) |
| [`marketplace/`](./marketplace) | Vendors sell their own products | `/marketplace/backend`, `/marketplace/storefront`, `/marketplace/vendor-portal` | Built — Phase 6 (exit P6-13 waits for the owner) |

Each category's `README.md` is its Dokploy guide: services, build paths, ports, env and first-deploy order.


## Documents

At the root: this README, [`BUILD_PLAN.md`](./BUILD_PLAN.md) and [`CLAUDE.md`](./CLAUDE.md). The plan stays at the root because its lock (hook, checksum, CI guard) is tied to that path; Claude Code reads `CLAUDE.md` only from the root. Everything else is in [`docs/`](./docs).

- [`BUILD_PLAN.md`](./BUILD_PLAN.md) — requirements, repo rules, app standard, Dokploy plan, per-scenario plans, **recommended build order**, update process. **Frozen.**
- [`CLAUDE.md`](./CLAUDE.md) — builder entry point: reading order and non-negotiable rules.
- [`docs/COMPARISON.md`](./docs/COMPARISON.md) — side-by-side comparison of all scenarios and when each fits.
- [`docs/TASKS.md`](./docs/TASKS.md) — development phases with a checklist per task (the living tracker).
- [`docs/MEDUSA_SKILL.md`](./docs/MEDUSA_SKILL.md) — verified Medusa reference (2.22.6 in every app) with sources; the only Medusa knowledge builders may use without a fresh lookup (skill `medusa-v2`).
- [`docs/DEV_FLOW.md`](./docs/DEV_FLOW.md) — build → verify → test → evidence-based fix cycle → commit → push.
- [`docs/BACKEND_PATTERNS_SKILL.md`](./docs/BACKEND_PATTERNS_SKILL.md) — backend design patterns mapped to Medusa's own mechanisms (skill `backend-patterns`).
- [`docs/PRE_DEPLOY_AUDIT.md`](./docs/PRE_DEPLOY_AUDIT.md) — the security and readiness audit to run per category before it goes live.
- [`docs/PLAN_LOCK.md`](./docs/PLAN_LOCK.md) — owner's note: the commands to unlock and lock `BUILD_PLAN.md` for Claude.
- [`docs/HANDOVER-2026-11-10.md`](./docs/HANDOVER-2026-11-10.md) — handover note of 2026-11-10.

## Principles

1. **Official Medusa only.** Medusa is used as published npm packages. Nothing upstream is forked or patched.
2. **Update any time, safely.** Exact version pins, a lockfile per app, and a CI gate every update must pass before deploy.
3. **Not a monorepo.** Every deployable (backend, storefront, portal, app) is independent: own `package.json`, lockfile, `Dockerfile`, `.env.example`. Nothing is shared; clients reach their backend only over HTTP.
4. **One business = one app.** Combine scenarios by adding modules to one app, never by syncing two apps.

Versions (2026-11-12): Medusa 2.22.6 in every app (npm `latest`, a security release, as the starters), Node `>=22.23.4`, Next.js 16.4.5, pnpm 12.18.0. Details and update plan: `BUILD_PLAN.md` (Revision 12, 2026-11-12). Starters: `medusajs/dtc-starter`, `medusajs/b2b-starter`.
