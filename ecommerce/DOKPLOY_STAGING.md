# Runbook: `ecommerce-staging` on Dokploy (tasks P0-18, P0-19)

Follow the steps in order. Field names are Dokploy's own (docs.dokploy.com, checked 2026-09-25). The project layout is decision **D6** (`TASKS.md`). File storage (**D3**, AWS S3) is wired in Phase 1 (P1-05), so staging runs **without S3** for now: leave every `S3_*` value empty.

**You need:** a Dokploy server with the GitHub provider connected to `tolakang/medusa-apps` (Dokploy → Git → GitHub App), and two hostnames. Either use your DNS (`api.staging.<your-domain>`, `shop.staging.<your-domain>` → the Dokploy server IP), or use Dokploy's **Generated** domains.

**Values to generate** (on your own machine, never commit them):
```bash
openssl rand -base64 32   # JWT_SECRET
openssl rand -base64 32   # COOKIE_SECRET
```

---

## 1. Project and databases

1. **Create Project** → name `ecommerce-staging`.
2. In it, **Create Service → Database → Postgres**: name `ecommerce-postgres`, database name `ecommerce`. Deploy it. Open its **General** tab and copy the **Internal Connection URL**. Do **not** enable External Credentials.
3. **Create Service → Database → Redis**: name `ecommerce-redis`. Deploy it and copy its **Internal Connection URL**.

## 2. Backend server: `ecommerce-backend`

1. **Create Service → Application**, name `ecommerce-backend`.
2. **General → Provider: GitHub**. Repository `medusa-apps`, Branch `main`, **Build Path `/`**, Trigger Type `On Push`.
3. **Build Type: Dockerfile**. **Docker File** = `ecommerce/backend/Dockerfile`, **Docker Context Path** = `ecommerce/backend`, Docker Build Stage empty. (Verified on staging 2026-09-25: both paths are relative to the repo root.)
4. **Watch Paths:** `ecommerce/backend/**`. Use the glob: a bare `ecommerce/backend/` may not match changed files.
5. **Environment → Environment Variables** (runtime). Paste this, replacing the `<…>` values:
   ```
   NODE_ENV=production
   PORT=9000
   DATABASE_URL=<Postgres Internal Connection URL>   # must start with postgres:// or postgresql://
   DATABASE_SSL=false
   REDIS_URL=<Redis Internal Connection URL>
   MEDUSA_FF_CACHING=true
   JWT_SECRET=<generated>
   COOKIE_SECRET=<generated>
   STORE_CORS=https://<shop host>
   ADMIN_CORS=https://<api host>
   AUTH_CORS=https://<api host>,https://<shop host>
   MEDUSA_BACKEND_URL=
   DISABLE_MEDUSA_ADMIN=false
   MEDUSA_WORKER_MODE=server
   RUN_MIGRATIONS=true
   ```
   (Generated domains are HTTP. Then use `http://` in the three CORS values.) Leave **Build Time Arguments** empty.

   > **Check before saving:** `DATABASE_URL` comes from **`ecommerce-postgres`**, and `REDIS_URL` from **`ecommerce-redis`**. A Redis URL in `DATABASE_URL` makes migrations hang for 60 s with `Knex: Timeout acquiring a connection`, and the domain shows Bad Gateway (seen on staging, finding F-012).
6. **Domains → Add Domain**: host `<api host>`, path `/`, **container port `9000`**, HTTPS on (Let's Encrypt) if you use your own DNS.
7. **Advanced → Cluster Settings → Swarm Settings.** The image has no `curl`, so the health check uses Node's `fetch`:
   - **Health Check**
     ```json
     {
       "Test": ["CMD", "node", "-e", "fetch('http://localhost:9000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
       "Interval": 30000000000,
       "Timeout": 10000000000,
       "StartPeriod": 120000000000,
       "Retries": 3
     }
     ```
   - **Update Config**
     ```json
     { "Parallelism": 1, "Delay": 10000000000, "FailureAction": "rollback", "Order": "start-first" }
     ```
   - Keep **Replicas = 1** (one migrating server per deploy, plan §8).
8. **Deploy.** Wait for the deployment to finish, then open `https://<api host>/health` → it must say `OK` (HTTP 200).
9. **First admin user.** Open the backend's terminal in Dokploy and run (the terminal opens in `/`. Images built before the entrypoint `cd /app` fix need `cd /app &&` in front):
   ```bash
   docker-entrypoint.sh medusa user -e <your-email> -p <password>
   ```
10. **Staging demo data** (region, sales channel, publishable key, 4 products). In the same terminal:
    ```bash
    docker-entrypoint.sh medusa exec ./src/scripts/seed-initial-data.js
    ```
    Then log in at `https://<api host>/app` → **Settings → Publishable API Keys**. Medusa also creates its own default key on first boot (finding F-005), so pick the key whose sales channel is **Default Sales Channel** and that shows products. Copy its token (`pk_…`).

## 3. Worker: `ecommerce-worker`

1. **Create Service → Application**, name `ecommerce-worker`. Use the **same** provider, branch, Build Path (`/`), Build Type, Docker File (`ecommerce/backend/Dockerfile`), Context (`ecommerce/backend`) and **Watch Paths `ecommerce/backend/**`** as the backend. Don't leave Watch Paths empty: an empty box redeploys the worker on every push to `main` (finding F-019).
2. **Environment:** the same variables as the backend, with these three changed:
   ```
   MEDUSA_WORKER_MODE=worker
   DISABLE_MEDUSA_ADMIN=true
   RUN_MIGRATIONS=false
   ```
3. **No domain. No health check.** Medusa still opens its HTTP listener in worker mode (the log shows `Server is ready on port: 9000`), but it is internal only and not routed, so nothing needs to probe it. Swarm **Update Config**:
   ```json
   { "Parallelism": 1, "Delay": 10000000000, "FailureAction": "rollback", "Order": "stop-first" }
   ```
   `stop-first` = never two workers at once during a deploy.
4. **Deploy** (only after the backend is healthy, because it relies on the migrations). **Logs** must show `[entrypoint] Starting Medusa (worker mode: worker)`, the Redis connections for `event-bus-redis`, `locking-redis` and `workflow-engine-redis`, then `Server is ready on port: 9000`, and no errors.

## 4. Storefront: `ecommerce-storefront`

1. **Create Service → Application**, name `ecommerce-storefront`. Provider GitHub, `main`, **Build Path `/`**, Build Type **Dockerfile**: **Docker File** = `ecommerce/storefront/Dockerfile`, **Docker Context Path** = `ecommerce/storefront`. **Watch Paths:** `ecommerce/storefront/**`.
2. **Environment → Build Time Arguments** (baked into the bundle; changing one = redeploy):
   ```
   NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://<api host>
   NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<pk_… from step 2.10>
   NEXT_PUBLIC_BASE_URL=https://<shop host>
   NEXT_PUBLIC_DEFAULT_REGION=dk
   NEXT_PUBLIC_STRIPE_KEY=
   S3_IMAGE_HOSTNAME=
   S3_IMAGE_PATHNAME=/**
   ```
   (`dk` is one of the seeded countries: gb, de, dk, se, fr, es, it.)
3. **Environment → Environment Variables** (runtime):
   ```
   NODE_ENV=production
   PORT=8000
   MEDUSA_BACKEND_URL=https://<api host>
   ```
   The public API URL is fine for staging. The backend's internal hostname also works (starter change 6), but only use it once you have confirmed the exact name.
4. **Domains:** host `<shop host>`, path `/`, **container port `8000`**, HTTPS as for the backend.
5. **Swarm Settings → Health Check.** `/favicon.ico` bypasses the middleware, so the check doesn't depend on the backend:
   ```json
   {
     "Test": ["CMD", "node", "-e", "fetch('http://localhost:8000/favicon.ico').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
     "Interval": 30000000000,
     "Timeout": 10000000000,
     "StartPeriod": 60000000000,
     "Retries": 3
   }
   ```
   **Update Config:** same as the backend (`start-first`, `rollback`).
6. **Deploy.** Open `https://<shop host>/`: it redirects to `/dk` and shows the store.

   **Checks that catch the staging mistakes seen so far:**
   - The key must see products (Medusa's own default key sees **0**, finding F-017):
     ```bash
     curl -s -H "x-publishable-api-key: <pk_…>" https://<api host>/store/products?fields=handle | head -c 200
     ```
     `"count":0` means the wrong key: use the one linked to the seed's **Default Sales Channel**.
   - The URL actually baked in (a typo in a build-time argument only shows up as a 500 on every page, F-016). In the storefront terminal:
     ```bash
     grep -oE 'https?://[A-Za-z0-9._:-]+' /app/.next/server/src/middleware.js | sort -u
     ```
     It must print `https://<api host>`.

---

## 5. P0-18 check: send me these, and I verify from here

Reply with: **`<api host>`**, **`<shop host>`**, and which Dockerfile path setting worked. I will check:
- `GET /health` = 200 and `GET /app/` = 200 on the API
- the store API with your publishable key returns the 4 products
- `/` redirects to `/dk`, and a product page renders server-side
- CORS: storefront origin accepted by the API

## 6. P0-19: independence and rollback (you click, I verify)

1. **Redeploy each app alone.** In `ecommerce-storefront` click **Deploy**. Afterwards, check that `ecommerce-backend` and `ecommerce-worker` show **no new deployment** in their **Deployments** tab. Repeat with the worker, then the backend.
2. **Watch paths.** I push a harmless commit that touches only `ecommerce/storefront/` (a comment), and only `ecommerce-storefront` should auto-deploy.
3. **Automatic rollback.** Dokploy's documented rollback without a registry is the Swarm health check. In `ecommerce-storefront` → Swarm Settings → Health Check, temporarily change `favicon.ico` to `does-not-exist` and **Deploy**. The new task fails its health check, Swarm rolls back, and `https://<shop host>/` keeps working the whole time. Then **restore** `favicon.ico` and deploy again.
4. Tell me the result of each step. I tick P0-18 / P0-19 in `TASKS.md` with this evidence, then run the phase exit checklist (P0-20).

**If anything fails:** send the deployment's log lines around the error. Don't retry with changed settings first. Same rule as `DEV_FLOW.md` §6.
