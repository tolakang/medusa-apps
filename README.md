# medusa-apps

Standalone [Medusa](https://medusajs.com) backends, one per commerce scenario, each deployable on its own with Dokploy.

> **Status: planning.** No application code yet. Start with [`BUILD_PLAN.md`](./BUILD_PLAN.md).

| Folder | Scenario | Status |
|---|---|---|
| [`ecommerce/`](./ecommerce) | Direct-to-consumer online store | Planned — Phase 1 |
| [`pos/`](./pos) | Physical shop checkout | Planned — Phase 2 |
| [`booking-services/`](./booking-services) | Appointments, classes, tickets, rentals | Planned — Phase 3 |
| [`wholesale/`](./wholesale) | Sellers buy your products in bulk | Planned — Phase 4 |
| [`reseller/`](./reseller) | Sellers sell your products, you ship | Planned — Phase 5 |
| [`marketplace/`](./marketplace) | Vendors sell their own products | Planned — Phase 6 |

## Documents

- [`COMPARISON.md`](./COMPARISON.md) — side-by-side comparison of all scenarios and when each fits.
- [`BUILD_PLAN.md`](./BUILD_PLAN.md) — requirements, repo rules, app standard, Dokploy plan, per-scenario plans, **recommended build order**, update process.

## Principles

1. **Official Medusa only.** Medusa is used as published npm packages. Nothing upstream is forked or patched.
2. **Update any time, safely.** Exact version pins, a lockfile per app, and a CI gate every update must pass before deploy.
3. **Not a monorepo.** Each folder is an independent app with its own `package.json`, lockfile, `Dockerfile` and `.env.example`. No folder depends on another.
4. **One business = one app.** Combine scenarios by adding modules to one app, never by syncing two apps.

Baseline (checked 2026-09-24): Medusa 2.21.1, pnpm 12.6.0, Node 22 LTS.
