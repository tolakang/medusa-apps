# pos / backend

Medusa **2.21.2** backend for the POS business project (physical shop + online shop on shared stock, BUILD_PLAN §6.2).

**Copied from `ecommerce/backend` at `main` `9105b07`** (TASKS Phase 2, owner 2026-10-15: POS reuses all of Ecommerce): PayWay, Resend, Telegram, Cambodia contact rules, anti-abuse, account emails, admin 2FA, wishlist and upload limits work the same here. POS features are added on top in P2-01 onwards; the ecommerce notes below apply unchanged. Done so far: module `pos` (`src/modules/pos`: `pos_register`, `pos_shift`, `pos_cashier`; P2-01, P2-03), links register → stock location / sales channel and shift → orders (`src/links/pos-*.ts`, P2-02), the invite-only `cashier` actor type with `POS_CORS` and cashier auth on every `/pos/*` route (`src/api/pos-auth.ts`, `src/workflows/pos-cashier.ts`, routes `/admin/pos/cashiers`, `/pos/cashiers/accept`, `/pos/cashiers/me`; P2-03, flow in `../README.md` → *Cashiers*), shift workflows `open-pos-shift` and `close-pos-shift` (`src/workflows/pos-shift.ts`, P2-04: one open shift per register, expected cash from payments whose session `metadata.pos_payment_method` is `cash`, variance = counted − expected), and the `pos-checkout` workflow (`src/workflows/pos-checkout.ts`, P2-05). `pos-checkout` creates a draft order in the register's sales channel with promo codes, converts it to an order, records the payment and links the order to the shift. Cash, card and QR all go through `pp_system_default`, tagged in the session's `metadata.pos_payment_method` (TASKS F-038). The routes are `/pos/*` for cashiers and `/admin/pos/*` for setup and reports (P2-06, listed in `../README.md` → *Shop setup and selling*); register setup goes through `src/workflows/pos-register.ts`. One image, deployed twice (server + worker). Standard: `BUILD_PLAN.md` §4.1. Medusa reference: `MEDUSA_SKILL.md`.

**Starter:** `medusajs/dtc-starter` `apps/backend` at commit **`15ef93d`** (2026-10-02, Medusa 2.21.2; synced from `e3a237c9b877`: the starter's changes since were the 2.21.2 package bump, done with `scripts/update-medusa.sh`, and `engines.node` `>=22.22.0`). Changes from the starter:
- pnpm standalone package: `packageManager`, settings-only `pnpm-workspace.yaml` (hoisting, `allowBuilds`, `tsconfig-paths` override).
- Env-driven `medusa-config.ts`: Redis modules (caching + `@medusajs/caching-redis`, event bus, workflow engine, locking), S3, worker mode, admin, `DATABASE_SSL`.
- `src/migration-scripts/initial-data-seed.ts` moved to `src/scripts/seed-initial-data.ts`. Migration scripts run automatically on every `db:migrate`, so the demo seed must not ship there. Run it by hand with `pnpm seed:initial`. Because it now runs after the first boot, it reuses the store, sales channel and publishable key Medusa created then (`createDefaultsWorkflow`) instead of creating a second channel and key (TASKS F-017; test `integration-tests/http/seed-initial-data.spec.ts`).
- Scripts added: `typecheck`, `predeploy` (safe migrate flags), `seed:*`, `--passWithNoTests` on module and unit tests.

## Run locally
```bash
podman compose -f ../docker-compose.local.yml up -d postgres redis   # or docker compose
cp .env.example .env    # then set DATABASE_URL=postgres://medusa:medusa@localhost:55432/pos etc.
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
podman build -t pos-backend:check .
```

## Deploy
See `../README.md` (Dokploy). Env: `.env.example`. Keep `DATABASE_SSL=false` for the Dokploy internal Postgres.
