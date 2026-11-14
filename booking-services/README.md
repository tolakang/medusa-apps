# Booking Services — `booking-services/`

> **Appointments, classes, tickets, rentals.** Phase 3 code done (P3-01 to P3-17); the exit checklist (P3-18, with a staging run) waits for the owner. Scope: [BUILD_PLAN.md §6.3](../BUILD_PLAN.md).
>
> `backend/` and `storefront/` are a **full copy of `ecommerce/`** (owner, 2026-11-04; TASKS F-044), started on Medusa 2.22.2, now **2.22.6** like every app (TASKS V-06). They build and run as a working Cambodia shop (PayWay, Telegram, email, contact rules). Booking features are added from P3-01 on. Local stack: `docker-compose.local.yml` (same host ports as the other categories, so run one stack at a time).

**Staging:** click-by-click runbook in [`DOKPLOY_STAGING.md`](./DOKPLOY_STAGING.md) (TASKS P3-18).

This folder is **one complete business project**. Copy the whole folder's setup into one Dokploy project and every piece deploys on its own.

```
booking-services/
├── README.md                <- this guide
├── backend/                 Medusa server + worker
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   └── .env.example
└── storefront/              customer storefront
    ├── Dockerfile
    └── .env.example
```

## Dokploy project: `booking-services`

| Service | Type | Build Path | Port → example domain | Env source |
|---|---|---|---|---|
| `booking-services-postgres` | Dokploy **PostgreSQL** | — | — | database `booking_services` |
| `booking-services-redis` | Dokploy **Redis** | — | — | — |
| `booking-services-backend` | Application (Dockerfile) | `/booking-services/backend` | 9000 → `api.example.com` | `backend/.env.example`, `MEDUSA_WORKER_MODE=server` |
| `booking-services-worker` | Application (Dockerfile) | `/booking-services/backend` | none | same env + worker overrides |
| `booking-services-storefront` | Application (Dockerfile) | `/booking-services/storefront` | 8000 → `shop.example.com` | `storefront/.env.example` (build args + runtime) |

Every application uses **Build Type: Dockerfile** with **Build Path `/`**, **Docker File** `booking-services/<app>/Dockerfile` and **Docker Context Path** `booking-services/<app>` (both relative to the repo root; verified on Dokploy staging 2026-09-25, finding F-011), and a **watch path** `booking-services/<app>/**`, so a change to one app never redeploys another. The "Build Path" column above is the app folder, not the Dokploy Build Path field.

## Deploy order (first time)

1. Create `booking-services-postgres` and `booking-services-redis`.
2. Deploy `booking-services-backend` (server). Migrations run on start. Check `https://api.example.com/health`.
3. Create the first admin user from the backend's Dokploy terminal:
   `docker-entrypoint.sh medusa user -e you@example.com -p <password>`
4. In the admin: create a region, a sales channel and a **publishable API key**.
5. Deploy `booking-services-worker` (same Build Path, worker overrides).
6. Put the publishable key and backend URL into the storefront's **Build-time Arguments**, then deploy `booking-services-storefront`.
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
- To add another scenario to this business (e.g. POS for a marketplace), add that module to **this** backend; do not deploy a second backend. See `docs/COMPARISON.md` §4.

## Services and tickets (TASKS P3-12)

- **A service** (haircut, massage, lesson) is a product **without a shipping profile** whose variants have **Manage inventory** off: one variant per length or staff level, with its length in the variant's metadata as `duration_minutes`. Its cart items need no shipping, so checkout skips the address and delivery steps. Link it to the resources that offer it (`POST /admin/booking/resources/:id` with `variant_ids`). Try it with `pnpm seed:booking-demo` (a Haircut service and one stylist).
- **Tickets for fixed-capacity events** (a show, a class with numbered seats, no staff calendar) use Medusa's [Ticket Booking recipe](https://docs.medusajs.com/resources/recipes/ticket-booking) instead: one inventory item per show date and section, its stocked quantity is the number of seats, and `requires_shipping` off on that inventory item. The `booking` module is for time slots of people, rooms and equipment.

