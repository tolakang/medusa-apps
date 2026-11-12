# marketplace / backend

Medusa **2.22.6** backend for the marketplace business project (vendors sell their own products; BUILD_PLAN §6.6). One image, deployed twice (server + worker). Standard: `BUILD_PLAN.md` §4.1. Medusa reference: `docs/MEDUSA_SKILL.md`.

**Copied from `ecommerce/backend` at `main` `eaacbfa`** (TASKS Phase 6, owner 2026-11-12: "Full copy of Ecommerce"; F-072), tracked files only: PayWay, Resend, Telegram, Cambodia contact rules, anti-abuse, account emails, admin 2FA, wishlist and upload limits work the same here. Already on Medusa 2.22.6, so no version update was needed.
- Package `marketplace-backend`; the Dockerfile, entrypoint, `.env.example` and comments name `marketplace/*` (database `marketplace`, `marketplace-postgres`, `marketplace-redis`).
- `.env.example` keeps the plan §6.6 settings from the old template: `MARKETPLACE_DEFAULT_COMMISSION_RATE`, `MARKETPLACE_REQUIRE_PRODUCT_APPROVAL`, `MARKETPLACE_PAYOUT_DAY`, `VENDOR_CORS` (read from P6-03 on).
- Local stack: `../docker-compose.local.yml` (same host ports as the other categories; run one at a time).

The vendor features (P6-01 onwards) are added on top. **P6-01:** module `marketplace` (`src/modules/marketplace`): `vendor` (handle, name, email, logo, status pending / active / suspended, commission rate; null = `MARKETPLACE_DEFAULT_COMMISSION_RATE`), `vendor_admin` (the people who sign in for a vendor; one per email) and `vendor_payout` (amount, currency, period `YYYY-MM`, status pending / paid / cancelled, `paid_at`, `reference`; one per vendor, period and currency). The ecommerce notes below apply unchanged.

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
