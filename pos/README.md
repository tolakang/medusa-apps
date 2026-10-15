# POS — `pos/`

> **Physical shop checkout + online store on shared stock.** Phase 2 in progress: `backend/` is built (a copy of `ecommerce/backend`, POS features follow); `storefront/` and `pos-app/` are still templates. Scope: [BUILD_PLAN.md §6.2](../BUILD_PLAN.md).
>
> The `storefront/` and `pos-app/` folders hold only **ready templates** (`Dockerfile`, `.env.example`); until their code is added, a Dokploy build of them fails at `COPY package.json`.

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
6. Put the publishable key and backend URL into the storefront's **Build-time Arguments**, then deploy `pos-storefront`.
7. Deploy `pos-pos-app`.
8. Set the final domains in the backend CORS variables and redeploy the backend.

After the first deploy, every service can be redeployed, rebuilt or rolled back **independently**.

## How the pieces connect

- All clients reach the backend only over HTTP. No shared code, no shared files, no shared build.
- Backend CORS must list each client domain:
  - `STORE_CORS` = storefront domain
  - `ADMIN_CORS` = admin domain only
  - `POS_CORS` = POS app domain (the app uses `/pos/*` routes as a `cashier`, not the admin API)
  - `AUTH_CORS` = every domain where someone logs in
- The storefront reaches the backend through the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (build-time). Runtime `MEDUSA_BACKEND_URL` can be the backend's **internal** Dokploy hostname once starter change 6 in BUILD_PLAN.md §4.2 is applied (faster, private; copy the exact name Dokploy shows for the service, it may carry a suffix). Build-time URLs must be **public**, because the build runs on the build server.
- `NEXT_PUBLIC_*` values are baked in at build time. Changing one = rebuild that client.

## Cashiers (POS app sign-in)

Cashiers are **not** admin users: they are the custom actor type `cashier` and can only use `/pos/*` (TASKS P2-03). Sign-up is invite-only:

1. An admin invites the cashier: `POST /admin/pos/cashiers` `{ "name", "email" }` (list: `GET /admin/pos/cashiers`).
2. The cashier registers that email: `POST /auth/cashier/emailpass/register` `{ "email", "password" }` (at least 8 characters) → registration token.
3. The cashier accepts with that token: `POST /pos/cashiers/accept` (`Authorization: Bearer <token>`). An email without an active invitation is refused.
4. From then on: `POST /auth/cashier/emailpass` → token for `/pos/*` (e.g. `GET /pos/cashiers/me`).

Setting a cashier's `is_active` to false locks them out at once, including tokens already issued. Sign-up and sign-in have the same per-IP limits as customers.

## Independence rules

- This project has its **own** Postgres and Redis. Never point two business projects at the same database.
- A second business of the same type = a second Dokploy project built from the same folder, with its own env.
- To add another scenario to this business (e.g. POS for a marketplace), add that module to **this** backend; do not deploy a second backend. See `COMPARISON.md` §4.
