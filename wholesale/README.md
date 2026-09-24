# Wholesale — `wholesale/`

> **Sellers buy your products in bulk (B2B).** Planned — Phase 4. Scope: [BUILD_PLAN.md §6.4](../BUILD_PLAN.md).
>
> The `Dockerfile` and `.env.example` files here are **ready templates**. Application code is added in the build phase; until then a Dokploy build of these folders will fail at `COPY package.json`.

This folder is **one complete business project**. Copy the whole folder's setup into one Dokploy project and every piece deploys on its own.

```
wholesale/
├── README.md                <- this guide
├── backend/                 Medusa server + worker
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   └── .env.example
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

Every application uses **Build Type: Dockerfile**, **Dockerfile path: `Dockerfile`**, and a **watch path** equal to its own Build Path (`/wholesale/<app>/**`), so a change to one app never redeploys another.

## Deploy order (first time)

1. Create `wholesale-postgres` and `wholesale-redis`.
2. Deploy `wholesale-backend` (server). Migrations run on start. Check `https://api.example.com/health`.
3. Create the first admin user from the backend's Dokploy terminal:
   `docker-entrypoint.sh medusa user -e you@example.com -p <password>`
4. In the admin: create a region, a sales channel and a **publishable API key**.
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
- Runtime `MEDUSA_BACKEND_URL` in a client can be the backend's **internal** Dokploy hostname (faster, private; copy the exact name Dokploy shows for the service, it may carry a suffix). Build-time URLs must be **public**, because the build runs on the build server.
- `NEXT_PUBLIC_*` values are baked in at build time. Changing one = rebuild that client.

## Independence rules

- This project has its **own** Postgres and Redis. Never point two business projects at the same database.
- A second business of the same type = a second Dokploy project built from the same folder, with its own env.
- To add another scenario to this business (e.g. POS for a marketplace), add that module to **this** backend; do not deploy a second backend. See `COMPARISON.md` §4.
