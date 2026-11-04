# booking-services / backend

Medusa **2.22.2** backend for the booking services business project (appointments, classes, rentals; BUILD_PLAN §6.3). One image, deployed twice (server + worker). Standard: `BUILD_PLAN.md` §4.1. Medusa reference: `MEDUSA_SKILL.md`.

**Copied from `ecommerce/backend` at `main` `26c3d97`** (TASKS Phase 3, owner 2026-11-04: full copy of Ecommerce, on the latest Medusa; F-044): PayWay, Resend, Telegram, Cambodia contact rules, anti-abuse, account emails, admin 2FA, wishlist and upload limits work the same here. Then moved from 2.21.2 to **2.22.2** with `scripts/update-medusa.sh booking-services 2.22.2`. Booking features are added on top from P3-01. Done so far: module `booking` (`src/modules/booking`, P3-01): `booking_resource` (staff, room, equipment or venue, with capacity and IANA time zone), `booking_schedule` (weekly hours as `"HH:MM"` in the resource's zone, 0 = Sunday) and `booking` (UTC times, status, hold expiry, customer, cart and line item), with database checks (TASKS F-045); links resource ↔ product variant (which services a resource offers, many-to-many) and booking → order (`src/links/booking-*.ts`, P3-02). The service checks a slot (`checkSlot` / `isSlotAvailable`: opening hours in the resource's zone, peak overlap against capacity, holds count until they expire) and creates holds (`createHold`, row-locked against double booking, `BOOKING_HOLD_MINUTES`; P3-03). The `add-booking-to-cart` workflow (`src/workflows/add-booking-to-cart.ts`, P3-04) creates the hold and its line item together (quantity 1, booking details in the item's `metadata`) and rolls the hold back if the line item can't be added. The ecommerce notes below apply unchanged.

**Starter (of the Ecommerce source):** `medusajs/dtc-starter` `apps/backend` at commit **`15ef93d`** (2026-10-02, Medusa 2.21.2; synced from `e3a237c9b877`: the starter's changes since were the 2.21.2 package bump, done with `scripts/update-medusa.sh`, and `engines.node` `>=22.22.0`). Changes from the starter:
- pnpm standalone package: `packageManager`, settings-only `pnpm-workspace.yaml` (hoisting, `allowBuilds`, `tsconfig-paths` override).
- Env-driven `medusa-config.ts`: Redis modules (caching + `@medusajs/caching-redis`, event bus, workflow engine, locking), S3, worker mode, admin, `DATABASE_SSL`.
- `src/migration-scripts/initial-data-seed.ts` moved to `src/scripts/seed-initial-data.ts`. Migration scripts run automatically on every `db:migrate`, so the demo seed must not ship there. Run it by hand with `pnpm seed:initial`. Because it now runs after the first boot, it reuses the store, sales channel and publishable key Medusa created then (`createDefaultsWorkflow`) instead of creating a second channel and key (TASKS F-017; test `integration-tests/http/seed-initial-data.spec.ts`).
- Scripts added: `typecheck`, `predeploy` (safe migrate flags), `seed:*`, `--passWithNoTests` on module and unit tests.

## Run locally
```bash
podman compose -f ../docker-compose.local.yml up -d postgres redis   # or docker compose
cp .env.example .env    # then set DATABASE_URL=postgres://medusa:medusa@localhost:55432/booking_services etc.
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
podman build -t booking-services-backend:check .
```

## Deploy
See `../README.md` (Dokploy). Env: `.env.example`. Keep `DATABASE_SSL=false` for the Dokploy internal Postgres.
