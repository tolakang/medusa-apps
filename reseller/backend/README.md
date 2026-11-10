# reseller / backend

Medusa **2.22.6** backend for the reseller business project (sellers sell your products on their own domains, you ship; BUILD_PLAN §6.5). One image, deployed twice (server + worker). Standard: `BUILD_PLAN.md` §4.1. Medusa reference: `MEDUSA_SKILL.md`.

**Copied from `ecommerce/backend` at `main` `847465d`** (TASKS Phase 5, owner 2026-11-10: "1" = full copy of Ecommerce; F-061), tracked files only: PayWay, Resend, Telegram, Cambodia contact rules, anti-abuse, account emails, admin 2FA, wishlist and upload limits work the same here. Already on Medusa 2.22.6 (V-06), so no version update was needed.
- Package `reseller-backend`; the Dockerfile, entrypoint, `.env.example` and comments name `reseller/*` (database `reseller`, `reseller-postgres`, `reseller-redis`).
- `.env.example` gains the plan §6.5 settings: `RESELLER_DEFAULT_COMMISSION_RATE`, `RESELLER_PAYOUT_DAY`, `SELLER_CORS` (read from P5-03 / P5-04 / P5-05 on).
- Local stack: `../docker-compose.local.yml` (same host ports as the other categories; run one at a time).

**P5-01:** module `seller` (`src/modules/seller`): `seller` (handle, name, email, domain, status, commission rate) and `seller_commission` (one per order). **P5-02:** each seller has one sales channel (`src/links/seller-sales-channel.ts`); `createSellerWorkflow` creates the seller with the channel, its publishable key and the stock-location links. **P5-03:** seller login (actor type `seller`, invite-only like POS cashiers): the shop invites with `POST /admin/sellers`, the seller registers at `/auth/seller/emailpass/register`, accepts at `POST /sellers/accept` and signs in at `/auth/seller/emailpass`; every `/sellers/*` route needs a signed-in seller who isn't suspended and passes `SELLER_CORS` (`src/api/seller-auth.ts`); `GET /sellers/me`. **P5-04:** commissions: `order.placed` → `recordSellerCommissionWorkflow` (one per order, locked; only active sellers; the seller's rate or `RESELLER_DEFAULT_COMMISSION_RATE`); `order.canceled` cancels it; `payment.refunded` recalculates it on what the shop kept (`src/modules/seller/commission.ts`, F-063). **P5-05:** payouts: on `RESELLER_PAYOUT_DAY` the daily job `seller-payout-batch` approves last month's pending commissions; `GET /admin/seller-payouts` shows what is due; after paying a seller outside Medusa, `POST /admin/sellers/:id/payouts` marks their approved commissions paid (F-064). **P5-06:** seller routes: `GET /sellers/me/products` (your published products, `selected` when in the seller's channel), `POST /sellers/me/products` (`add` / `remove`, your published products only), `GET /sellers/me/commissions` (own, newest first, with totals). **P5-07:** `GET /store/sellers/resolve?domain=|handle=` gives the storefront an active seller's publishable key. **P5-08:** `GET /sellers/me/orders` for the seller portal (`../seller-portal`): orders in the seller's channel with their commission, no customer details. The ecommerce notes below apply unchanged.

---

## From `ecommerce/backend`

Medusa **2.21.2** backend for the ecommerce business project. One image, deployed twice (server + worker). Standard: `BUILD_PLAN.md` §4.1. Medusa reference: `MEDUSA_SKILL.md`.

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
