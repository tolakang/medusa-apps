# wholesale / backend

Medusa **2.22.6** backend for the wholesale (B2B) business project. One image, deployed twice (server + worker). Standard: `BUILD_PLAN.md` §4.1, scenario: §6.4. Medusa reference: `MEDUSA_SKILL.md`.

**Starter:** `medusajs/b2b-starter` `apps/backend` at commit **`47eecab`** (2026-11-05, Medusa 2.22.3, the last starter commit on 2.22.3; the starter moved to 2.22.4 and 2.22.6 on 2026-11-09, TASKS F-055). Modules from the starter: `company` (+ `employee`), `quote`, `approval`, with their links, workflows, hooks, API routes and admin pages. Changes from the starter (TASKS P4-01):
- Medusa 2.22.3 → **2.22.6** after the copy (security release; `scripts/update-medusa.sh wholesale 2.22.6`, TASKS V-06), `@medusajs/ui` 4.2.13. The starter itself is on 2.22.6 since `f352e3c`; its 2.22.4 and 2.22.6 commits only bump versions.
- pnpm standalone package: name `wholesale-backend`, `packageManager` pnpm 12.17.0, settings-only `pnpm-workspace.yaml` (hoisting, `allowBuilds`). The starter's monorepo used `node-linker=hoisted`, which let it import packages it never declared; these are now direct dependencies at the versions the starter's lockfile resolved: `date-fns` 4.4.0 (admin), `jsonwebtoken` 9.0.3, `@types/jsonwebtoken` 9.0.10 and `scrypt-kdf` 2.0.1 (tests). `@medusajs/eslint-plugin`, `eslint`, `jiti` moved here from the starter's root. `@medusajs/ui` pinned like the other backends (F-006).
- Env-driven `medusa-config.ts`: the same infrastructure block as `ecommerce/backend` (Redis modules: caching + `@medusajs/caching-redis`, event bus, workflow engine, locking; S3; worker mode; admin; `DATABASE_SSL`; `SESSION_COOKIE_SECURE`) plus the starter's three modules.
- `src/migration-scripts/initial-data-seed.ts` moved to `src/scripts/seed-initial-data.ts` (F-002) and reuses the store, sales channel and publishable key Medusa creates on first boot (F-017; test `integration-tests/http/seed-initial-data.spec.ts`). `src/migration-scripts/region-store-policies.ts` stays: it only fills missing store-policy metadata on existing regions.
- Repo rules (DEV_FLOW Gate 5): `@medusajs/core-flows` imports → `@medusajs/medusa/core-flows`; the two admin `zod` imports → `@medusajs/framework/zod`; the six `as any` removed (three were not needed; `update-order` takes the `OrderStatus` type; `checkSpendingLimit`, `getSpendWindow` and `computeShippingOptionTargets` take only the fields they read, so query results fit).
- Starter type errors fixed (the starter has no `typecheck`): unneeded cast in the admin quote items list; `inApp` removed from the test runner options (not an option in `@medusajs/test-utils` 2.22.3); test JWT falls back to Medusa's default secret.
- Starter tests brought up to 2.22.3: the test product is `published` (carts reject draft products' variants) and the quote summary no longer expects `difference_sum` (not in `OrderSummaryDTO`). Added `health.spec.ts` and `seed-initial-data.spec.ts` from ecommerce.
- Not copied: `.env.template`, `.npmrc`, `.vscode/`, `static/` (demo images; the seed uses Medusa's public image URLs), the generic `README.md` guides under `src/` and `integration-tests/http/` (F-053).
- P4-02: `company` gains `payment_terms`, `credit_limit`, `tax_id`, `status` (admin API and admin form; buyers may set only `tax_id`); `POST /store/companies/:id` now validates its body (F-058).
- P4-03: `src/scripts/seed-b2b.ts` (`seed:b2b`): the B2B sales channel and its publishable key; with `demo-pricing`, Gold / Silver customer groups, price lists on `customer.groups.id` and quantity tiers. A company gets a tier by joining a customer group (admin: company → customer group).
- Scripts added: `typecheck`, `predeploy` (safe migrate flags), `seed:initial`, `--passWithNoTests` on module and unit tests.

Known starter behaviour left for later tasks: **the store company routes don't check that the company is the buyer's own (F-058, P4-07, must be fixed before any deploy)**; the cart-completion hook reads only `employee.spending_limit`, so the spend window and past orders are not counted yet (P4-04); hooks throw plain `Error` (lint warnings; P4-04); module tables have no prefix (`company`, `quote`, `message`, …; F-055).

## Run locally
```bash
cp .env.example .env    # then set DATABASE_URL, REDIS_URL, CORS for your local Postgres/Redis
pnpm install --frozen-lockfile
pnpm medusa db:migrate --execute-safe-links --execute-safe-search
pnpm dev                                    # http://localhost:9000/app (Companies, Quotes, Approvals)
pnpm medusa user -e admin@example.com -p <password>
pnpm seed:initial                           # optional demo data (EU region, demo products); after the first start
pnpm seed:b2b                               # "Wholesale" channel + its publishable key (prints it; safe in production)
pnpm seed:b2b demo-pricing                  # + Gold / Silver groups and price lists with volume tiers (demo)
```

## Verify (DEV_FLOW §5)
```bash
pnpm build && pnpm typecheck
DB_HOST=localhost DB_PORT=5432 DB_USERNAME=medusa DB_PASSWORD=medusa pnpm test:integration:http
podman build -t wholesale-backend:check .
```

## Deploy
See `../README.md` (Dokploy). Env: `.env.example`. Keep `DATABASE_SSL=false` for the Dokploy internal Postgres.
