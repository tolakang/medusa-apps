# Ecommerce — `ecommerce/`

> **Direct-to-consumer online store.** Planned — Phase 1. Scope: [BUILD_PLAN.md §6.1](../BUILD_PLAN.md).
>
> The `Dockerfile` and `.env.example` files here are **ready templates**. Application code is added in the build phase; until then a Dokploy build of these folders will fail at `COPY package.json`.

This folder is **one complete business project**. Copy the whole folder's setup into one Dokploy project and every piece deploys on its own.

```
ecommerce/
├── README.md                <- this guide
├── backend/                 Medusa server + worker
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   └── .env.example
└── storefront/              customer storefront
    ├── Dockerfile
    └── .env.example
```

## Dokploy project: `ecommerce`

| Service | Type | Build Path | Port → example domain | Env source |
|---|---|---|---|---|
| `ecommerce-postgres` | Dokploy **PostgreSQL** | — | — | database `ecommerce` |
| `ecommerce-redis` | Dokploy **Redis** | — | — | — |
| `ecommerce-backend` | Application (Dockerfile) | `/ecommerce/backend` | 9000 → `api.example.com` | `backend/.env.example`, `MEDUSA_WORKER_MODE=server` |
| `ecommerce-worker` | Application (Dockerfile) | `/ecommerce/backend` | none | same env + worker overrides |
| `ecommerce-storefront` | Application (Dockerfile) | `/ecommerce/storefront` | 8000 → `shop.example.com` | `storefront/.env.example` (build args + runtime) |

Every application uses **Build Type: Dockerfile** with **Build Path `/`**, **Docker File** `ecommerce/<app>/Dockerfile` and **Docker Context Path** `ecommerce/<app>` (both relative to the repo root; verified on Dokploy staging 2026-09-25, finding F-011), and a **watch path** `ecommerce/<app>/**`, so a change to one app never redeploys another. The "Build Path" column above is the app folder, not the Dokploy Build Path field.

## Deploy order (first time)

1. Create `ecommerce-postgres` and `ecommerce-redis`.
2. Deploy `ecommerce-backend` (server). Migrations run on start. Check `https://api.example.com/health`.
3. Create the first admin user from the backend's Dokploy terminal:
   `docker-entrypoint.sh medusa user -e you@example.com -p <password>`
4. In the admin: create a region, a sales channel and a **publishable API key**.
5. Deploy `ecommerce-worker` (same Build Path, worker overrides).
6. Put the publishable key and backend URL into the storefront's **Build-time Arguments**, then deploy `ecommerce-storefront`.
7. Set the final domains in the backend CORS variables and redeploy the backend.

After the first deploy, every service can be redeployed, rebuilt or rolled back **independently**.

## Staging project: `ecommerce-staging` (decision D6)

Step-by-step setup: **[DOKPLOY_STAGING.md](./DOKPLOY_STAGING.md)** (Dokploy field names, env, health checks, rollback test).

Staging is a **second Dokploy project** built from this same folder — never a
second environment inside the production project:

| Production | Staging |
|---|---|
| project `ecommerce` | project `ecommerce-staging` |
| `ecommerce-postgres`, `ecommerce-redis` | its **own** Postgres and Redis (never the production ones) |
| `api.example.com`, `shop.example.com` | `api.staging.example.com`, `shop.staging.example.com` |
| production S3 bucket | its own bucket, or a `staging/` prefix (`S3_FILE_URL`, `S3_IMAGE_HOSTNAME` point at it) |
| real Stripe keys, real email sender | test-mode keys, `notification-local` where possible |

Same Build Paths, same watch paths, same `Dockerfile`s, same `.env.example`
keys — only the values differ. Deploy order is the one above, including the
manual admin user and publishable key (the key differs per project, so the
storefront's build-time arguments differ too).

Use it for the phase exit checklist: deploy the whole category to staging,
redeploy each app alone, roll one back, then promote the same commit to
production with the §5 runbook (backup first, one server replica while
migrating).

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
