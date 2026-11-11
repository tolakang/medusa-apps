# Wholesale — `wholesale/`

> **Sellers buy your products in bulk (B2B).** Phase 4, in progress (started 2026-11-10): backend tasks P4-01 to P4-07 merged; next the storefront (P4-08). Scope: [BUILD_PLAN.md §6.4](../BUILD_PLAN.md).
>
> `backend/` has app code: the official `b2b-starter` backend (companies, employees, quotes, approvals) on Medusa 2.22.6, see [backend/README.md](backend/README.md) (TASKS P4-01). `storefront/` still holds only the **template** `Dockerfile` and `.env.example`; its code comes with P4-08, and until then a Dokploy build of that folder fails at `COPY package.json`.

This folder is **one complete business project**. Copy the whole folder's setup into one Dokploy project and every piece deploys on its own.

```
wholesale/
├── README.md                <- this guide
├── backend/                 Medusa server + worker (from b2b-starter; README.md lists the changes)
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   ├── .env.example
│   └── src/                 modules company, quote, approval
└── storefront/              customer storefront
    ├── Dockerfile
    └── .env.example
```

## Dokploy project: `wholesale`

| Service | Type | Build Path | Port → example domain | Env source |
|---|---|---|---|---|
| `wholesale-postgres` | Dokploy **PostgreSQL** | — | — | database `wholesale` |
| `wholesale-redis` | Dokploy **Redis** | — | — | — |
| `wholesale-backend` | Application (Dockerfile) | `/wholesale/backend` | 9000 → `api.example.com` | `backend/.env.example`, `MEDUSA_WORKER_MODE=server` |
| `wholesale-worker` | Application (Dockerfile) | `/wholesale/backend` | none | same env + worker overrides |
| `wholesale-storefront` | Application (Dockerfile) | `/wholesale/storefront` | 8000 → `shop.example.com` | `storefront/.env.example` (build args + runtime) |

Every application uses **Build Type: Dockerfile** with **Build Path `/`**, **Docker File** `wholesale/<app>/Dockerfile` and **Docker Context Path** `wholesale/<app>` (both relative to the repo root; verified on Dokploy staging 2026-09-25, finding F-011), and a **watch path** `wholesale/<app>/**`, so a change to one app never redeploys another. The "Build Path" column above is the app folder, not the Dokploy Build Path field.

## Deploy order (first time)

1. Create `wholesale-postgres` and `wholesale-redis`.
2. Deploy `wholesale-backend` (server). Migrations run on start. Check `https://api.example.com/health`.
3. Create the first admin user from the backend's Dokploy terminal:
   `docker-entrypoint.sh medusa user -e you@example.com -p <password>`
4. In the admin: create a region. Then run `docker-entrypoint.sh medusa exec ./src/scripts/seed-b2b.js` once in the backend terminal (safe to re-run): it creates the **"Wholesale"** sales channel and its **publishable API key** (printed in the log) and puts the products in it (TASKS P4-03). Price tiers: create customer groups and price lists in the admin, and add each company to its group.
5. Deploy `wholesale-worker` (same Build Path, worker overrides).
6. Put the publishable key and backend URL into the storefront's **Build-time Arguments**, then deploy `wholesale-storefront`.
7. Set the final domains in the backend CORS variables and redeploy the backend.

After the first deploy, every service can be redeployed, rebuilt or rolled back **independently**.

## How the pieces connect

- All clients reach the backend only over HTTP. No shared code, no shared files, no shared build.
- Backend CORS must list each client domain:
  - `STORE_CORS` = storefront domain
  - `ADMIN_CORS` = backend/admin domain
  - `AUTH_CORS` = every domain where someone logs in
- The storefront reaches the backend through the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (build-time). Runtime `MEDUSA_BACKEND_URL` can be the backend's **internal** Dokploy hostname once starter change 6 in BUILD_PLAN.md §4.2 is applied (faster, private; copy the exact name Dokploy shows for the service, it may carry a suffix). Build-time URLs must be **public**, because the build runs on the build server.
- `NEXT_PUBLIC_*` values are baked in at build time. Changing one = rebuild that client.

## Independence rules

- This project has its **own** Postgres and Redis. Never point two business projects at the same database.
- A second business of the same type = a second Dokploy project built from the same folder, with its own env.
- To add another scenario to this business (e.g. POS for a marketplace), add that module to **this** backend; do not deploy a second backend. See `COMPARISON.md` §4.
