# marketplace / backend

Medusa **2.22.6** backend for the marketplace business project (vendors sell their own products; BUILD_PLAN §6.6). One image, deployed twice (server + worker). Standard: `BUILD_PLAN.md` §4.1. Medusa reference: `docs/MEDUSA_SKILL.md`.

**Copied from `ecommerce/backend` at `main` `eaacbfa`** (TASKS Phase 6, owner 2026-11-12: "Full copy of Ecommerce"; F-072), tracked files only: PayWay, Resend, Telegram, Cambodia contact rules, anti-abuse, account emails, admin 2FA, wishlist and upload limits work the same here. Already on Medusa 2.22.6, so no version update was needed.
- Package `marketplace-backend`; the Dockerfile, entrypoint, `.env.example` and comments name `marketplace/*` (database `marketplace`, `marketplace-postgres`, `marketplace-redis`).
- `.env.example` keeps the plan §6.6 settings from the old template: `MARKETPLACE_DEFAULT_COMMISSION_RATE`, `MARKETPLACE_REQUIRE_PRODUCT_APPROVAL`, `MARKETPLACE_PAYOUT_DAY`, `VENDOR_CORS` (read from P6-03 on).
- Local stack: `../docker-compose.local.yml` (same host ports as the other categories; run one at a time).

The vendor features (P6-01 onwards) are added on top. **P6-01:** module `marketplace` (`src/modules/marketplace`): `vendor` (handle, name, email, logo, status pending / active / suspended, commission rate; null = `MARKETPLACE_DEFAULT_COMMISSION_RATE`), `vendor_admin` (the people who sign in for a vendor; one per email) and `vendor_payout` (amount, currency, period `YYYY-MM`, status pending / paid / cancelled, `paid_at`, `reference`; one per vendor, period and currency). **P6-02:** links `src/links/vendor-product.ts`, `vendor-order.ts` (child orders only), `vendor-stock-location.ts`: a vendor has many of each, each has one vendor (Query `vendor.products`, `product.vendor`, …). **P6-03:** vendor sign-up and access (actor type `vendor`, as in the official Vendors example): register at `/auth/vendor/emailpass/register`, `POST /vendors` with that token (`createVendorWorkflow`: vendor `pending` + first vendor admin, email from the registration), sign in at `/auth/vendor/emailpass`. Every `/vendors*` route passes `VENDOR_CORS` and needs a signed-in vendor admin; a pending vendor may only read `GET /vendors/me`, a suspended one is refused (`src/api/vendor-auth.ts`). The admin approves at `POST /admin/vendors/:id` `{ "status": "active" }` (queue: `GET /admin/vendors?status=pending`). **P6-04:** `POST /vendors/products` (the admin's product body; `createVendorProductWorkflow` puts it in the store's default sales channel and links it to the vendor) and `GET /vendors/products`. A vendor's product is `draft` (or `proposed` for review) until the marketplace publishes it; with `MARKETPLACE_REQUIRE_PRODUCT_APPROVAL=false` a vendor may publish. **P6-05:** the storefront completes checkout with `POST /store/carts/:id/complete-vendor` (not `/complete`): `createVendorOrdersWorkflow` makes the parent order (payment) and one child order per vendor (linked to the vendor, `metadata.parent_order_id`; the parent lists them in `metadata.child_order_ids`), moving the stock reservations to the children. Each child gets a share of the shipping by the value of its items (`src/lib/shipping-split.ts`, owner decision F-076). A retry or a second call returns the same orders. **P6-06:** each child order gets a `vendor_commission` (the vendor's rate or `MARKETPLACE_DEFAULT_COMMISSION_RATE` on the items after discounts, without tax and shipping; the vendor is owed the child total minus it). On `MARKETPLACE_PAYOUT_DAY` the job `vendor-payouts` makes one payout per vendor and currency for last month; the admin pays outside Medusa and records it at `POST /admin/vendor-payouts/:id/pay` `{ "reference" }` (report: `GET /admin/vendor-payouts`). A cancelled child order cancels its commission before payout. Vendors see theirs at `GET /vendors/me/payouts`. A refund on a customer's order holds its vendors' commissions out of payouts until the admin settles them in the payout report's **Refunds to review** (keep, reduce or cancel; F-078, P6-14). **P6-07 (admin):** sidebar pages **Vendors** (approval queue, suspend, commission rate), **Product moderation** (publish or reject vendors' products), **Vendor payouts** (breakdown, mark paid with the transfer reference) and **Vendor orders** (child orders); the order page shows a parent's vendor orders, or a child's vendor and parent. **P6-08:** `GET /store/vendors/:handle` (shop page) and `GET /store/product-vendors?product_id=…` ("Sold by"); an `order.placed` subscriber splits orders completed without `complete-vendor` (e.g. by PayWay's webhook) through the same locked `split-vendor-order` workflow (F-079). The ecommerce notes below apply unchanged.

---

## From `ecommerce/backend`

Medusa **2.22.6** (since 2026-11-10, TASKS V-06; earlier 2.21.2 until 2026-11-06, then 2.22.3) backend for the ecommerce business project. One image, deployed twice (server + worker). Standard: `BUILD_PLAN.md` §4.1. Medusa reference: `docs/MEDUSA_SKILL.md`.

**Starter:** `medusajs/dtc-starter` `apps/backend` at commit **`15ef93d`** (2026-10-02, Medusa 2.21.2; synced from `e3a237c9b877`: the starter's changes since were the 2.21.2 package bump, done with `scripts/update-medusa.sh`, and `engines.node` `>=22.22.0`). Changes from the starter:
- pnpm standalone package: `packageManager`, settings-only `pnpm-workspace.yaml` (hoisting, `allowBuilds`, `tsconfig-paths` override).
- Env-driven `medusa-config.ts`: Redis modules (caching + `@medusajs/caching-redis`, event bus, workflow engine, locking), S3, worker mode, admin, `DATABASE_SSL`.
- `src/migration-scripts/initial-data-seed.ts` moved to `src/scripts/seed-initial-data.ts`. Migration scripts run automatically on every `db:migrate`, so the demo seed must not ship there. Run it by hand with `pnpm seed:initial`. Because it now runs after the first boot, it reuses the store, sales channel and publishable key Medusa created then (`createDefaultsWorkflow`) instead of creating a second channel and key (TASKS F-017; test `integration-tests/http/seed-initial-data.spec.ts`).
- Scripts added: `typecheck`, `predeploy` (safe migrate flags), `seed:*`, `--passWithNoTests` on module and unit tests.

## Run locally
```bash
podman compose -f ../docker-compose.local.yml up -d postgres redis   # or docker compose
cp .env.example .env    # then set DATABASE_URL=postgres://medusa:medusa@localhost:55432/ecommerce etc.
pnpm install --frozen-lockfile
pnpm medusa db:migrate --execute-safe-links --execute-safe-search
pnpm dev                                    # http://localhost:9000/app
pnpm medusa user -e admin@example.com -p <password>
# Product images (TASKS P1-11): upload JPEG (quality ~80), PNG or WebP, about 1600 px on
# the longest side, max 0.8 MB (≈ 800 KB) by default; admins change the limit in Settings → Store (up to
# UPLOAD_MAX_FILE_SIZE_CEILING_MB, default 5, also a build arg); SVG is rejected. The shop serves images
# as uploaded, so smaller files load faster for customers.
# Notifications (TASKS P1-04): order.placed → customer email (Resend) + staff alert (Telegram).
# Without RESEND_API_KEY / TELEGRAM_BOT_TOKEN both channels only log (notification-local).
# Customer updates on Telegram (TASKS P1-17): a separate customer bot; the order page links to it,
# the customer taps Start, the bot confirms the order and reports shipped / delivered / canceled.
# Env TELEGRAM_CUSTOMER_*, webhook POST /telegram/webhook, setup: src/scripts/telegram-set-webhook.ts.
# Payments (TASKS P1-03): ABA PayWay provider pp_payway_payway (src/modules/payway) when PAYWAY_MERCHANT_ID
# and PAYWAY_API_KEY are set; callback /hooks/payment/payway_payway; add it to the region in the admin.
pnpm seed                                   # real shop: Cambodia region (USD + KHR), tax region, Phnom Penh delivery (TASKS P1-02)
pnpm seed:initial                           # optional demo data (EU regions, demo products, publishable key)
```

## Verify (DEV_FLOW §5)
```bash
pnpm build && pnpm typecheck
DB_HOST=localhost DB_PORT=55432 DB_USERNAME=medusa DB_PASSWORD=medusa pnpm test:integration:http
podman build -t ecommerce-backend:check .
```

## Deploy
See `../README.md` (Dokploy). Env: `.env.example`. Keep `DATABASE_SSL=false` for the Dokploy internal Postgres.
