# POS — `pos/`

> **Physical shop checkout + online store on shared stock.** Phase 2 in progress; all three apps are built:
> - `backend/`: a copy of `ecommerce/backend`. The POS module, cashier sign-in, shifts, checkout and the `/pos` and `/admin/pos` routes are in; see *Shop setup and selling*.
> - `pos-app/`: the counter PWA (TASKS P2-10, `pos-app/README.md`).
> - `storefront/`: the online shop, a copy of `ecommerce/storefront` (TASKS P2-09, `storefront/README.md`).
>
> Scope: [BUILD_PLAN.md §6.2](../BUILD_PLAN.md).

This folder is **one complete business project**. Copy the whole folder's setup into one Dokploy project and every piece deploys on its own.

```
pos/
├── README.md                <- this guide
├── backend/                 Medusa server + worker
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   └── .env.example
├── storefront/              customer storefront
│   ├── Dockerfile
│   └── .env.example
└── pos-app/                 POS counter app (web / PWA)
    ├── Dockerfile
    └── .env.example
```

## Dokploy project: `pos`

| Service | Type | Build Path | Port → example domain | Env source |
|---|---|---|---|---|
| `pos-postgres` | Dokploy **PostgreSQL** | — | — | database `pos` |
| `pos-redis` | Dokploy **Redis** | — | — | — |
| `pos-backend` | Application (Dockerfile) | `/pos/backend` | 9000 → `api.example.com` | `backend/.env.example`, `MEDUSA_WORKER_MODE=server` |
| `pos-worker` | Application (Dockerfile) | `/pos/backend` | none | same env + worker overrides |
| `pos-storefront` | Application (Dockerfile) | `/pos/storefront` | 8000 → `shop.example.com` | `storefront/.env.example` (build args + runtime) |
| `pos-pos-app` | Application (Dockerfile) | `/pos/pos-app` | 3000 → `pos.example.com` | `pos-app/.env.example` (build args + runtime) |

Every application uses **Build Type: Dockerfile** with **Build Path `/`**, **Docker File** `pos/<app>/Dockerfile` and **Docker Context Path** `pos/<app>` (both relative to the repo root; verified on Dokploy staging 2026-09-25, finding F-011), and a **watch path** `pos/<app>/**`, so a change to one app never redeploys another. The "Build Path" column above is the app folder, not the Dokploy Build Path field.

## Deploy order (first time)

1. Create `pos-postgres` and `pos-redis`.
2. Deploy `pos-backend` (server). Migrations run on start. Check `https://api.example.com/health`.
3. Create the first admin user from the backend's Dokploy terminal:
   `docker-entrypoint.sh medusa user -e you@example.com -p <password>`
4. In the admin: create a region, a sales channel and a **publishable API key**.
5. Deploy `pos-worker` (same Build Path, worker overrides).
6. Put the publishable key and backend URL into the storefront's **Build-time Arguments**, then deploy `pos-storefront`. Use the key of the **online** sales channel. Link that key to exactly one channel, which must hold the products (see *Stock*).
7. Deploy `pos-pos-app` with runtime `MEDUSA_BACKEND_URL` (the backend's internal hostname) and `COOKIE_SECRET` (`openssl rand -hex 32`). No build arguments are needed.
8. Set the final domains in the backend CORS variables and redeploy the backend.

After the first deploy, every service can be redeployed, rebuilt or rolled back **independently**.

## How the pieces connect

- All clients reach the backend only over HTTP. No shared code, no shared files, no shared build.
- Backend CORS must list each client domain:
  - `STORE_CORS` = storefront domain
  - `ADMIN_CORS` = admin domain only
  - `POS_CORS` = POS app domain. The app built in P2-10 calls `/pos/*` from its own server (the browser never sees the token), so it doesn't need CORS. Set it only for a client that calls `/pos/*` from the browser.
  - `AUTH_CORS` = every domain where someone logs in
- The storefront reaches the backend through the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (build-time). Runtime `MEDUSA_BACKEND_URL` can be the backend's **internal** Dokploy hostname once starter change 6 in BUILD_PLAN.md §4.2 is applied (faster, private; copy the exact name Dokploy shows for the service, it may carry a suffix). Build-time URLs must be **public**, because the build runs on the build server.
- `NEXT_PUBLIC_*` values are baked in at build time. Changing one = rebuild that client.

## Cashiers (POS app sign-in)

Cashiers are **not** admin users: they are the custom actor type `cashier` and can only use `/pos/*` (TASKS P2-03). Sign-up is invite-only:

1. An admin invites the cashier: `POST /admin/pos/cashiers` `{ "name", "email" }` (list: `GET /admin/pos/cashiers`).
2. The cashier registers that email: `POST /auth/cashier/emailpass/register` `{ "email", "password" }` (at least 8 characters) → registration token.
3. The cashier accepts with that token: `POST /pos/cashiers/accept` (`Authorization: Bearer <token>`). An email without an active invitation is refused.
4. From then on: `POST /auth/cashier/emailpass` → token for `/pos/*` (e.g. `GET /pos/cashiers/me`).

Setting a cashier's `is_active` to false (`POST /admin/pos/cashiers/:id` `{ "is_active": false }`) locks them out at once, including tokens already issued. Sign-up and sign-in have the same per-IP limits as customers.

## Shop setup and selling (API, TASKS P2-06)

Admin (admin token):
- `POST /admin/pos/registers` `{ name, code, stock_location_id, sales_channel_id }` sets up a till; each register sells from one stock location in one sales channel. List: `GET /admin/pos/registers`. Change: `POST /admin/pos/registers/:id` (name, `is_active`, location, channel).
- **Shift report** in the admin sidebar (`/app/pos-shifts`, TASKS P2-07): shifts per day, register or cashier, with expected cash, counted cash and the variance (red when cash is short). It filters by register, cashier, status and dates, and reads `GET /admin/pos/shifts?register_id=&cashier_id=&status=&from=&to=`.

Cashier: the **POS app** (`pos-app/`, P2-10) does all of this on screen: sign in (first time: *Set your password*), pick a register, open the shift, scan, customer, pay, print, close. The routes underneath (cashier token):
1. `GET /pos/registers` lists the registers; pick one, then `POST /pos/shifts/open` `{ register_id, opening_cash }`.
2. `GET /pos/products/lookup?code=<scanned>&shift_id=` finds the product by barcode, EAN, UPC or SKU, with its price.
3. Optionally find or add the customer: `GET /pos/customers?q=` or `POST /pos/customers` `{ first_name, phone | email }`.
4. `POST /pos/checkout` `{ shift_id, items: [{ variant_id, quantity }], payment_method: cash | card | qr, customer_id?, promo_codes? }` records the sale and returns the order for the receipt.
5. `POST /pos/shifts/close` `{ shift_id, counted_cash }` returns the expected cash and the variance.

Card and QR payments are taken on the shop's own terminal or KHQR stand, and the sale only records them (TASKS F-038).

**Stock (TASKS P2-11).** A register sells only from its own stock location. Give each shop location inventory in the admin (Inventory → item → locations), otherwise the till answers "Not enough stock at <shop>". The sale is fulfilled at once from that location, so the shop's stock goes down at the counter and other locations (the warehouse, the online shop's stock) are untouched. To do that, every register location gets a hidden shipping option, **"In store (POS)"**. It is created when the register is set up and never appears in the online checkout. Don't delete it; if it's deleted, the next sale creates it again.

**Online shop on the same stock (TASKS P2-09).** To let the online shop sell the shop's stock, link the shop's stock location to the online sales channel as well (Admin → Settings → Locations & Shipping → the shop → Sales Channels). The online shop shows stocked − reserved over its channel's locations, so:
- a till sale lowers what the shop page shows at once;
- an online order reserves stock, which the till then can't sell (e.g. "Not enough stock at Phnom Penh: … (7 left)").

Stock that only the online shop should sell (a warehouse) goes in a location that no register uses.

## Independence rules

- This project has its **own** Postgres and Redis. Never point two business projects at the same database.
- A second business of the same type = a second Dokploy project built from the same folder, with its own env.
- To add another scenario to this business (e.g. POS for a marketplace), add that module to **this** backend; do not deploy a second backend. See `COMPARISON.md` §4.
