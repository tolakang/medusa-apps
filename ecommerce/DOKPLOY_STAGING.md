# Runbook: `ecommerce-staging` on Dokploy (tasks P0-18, P0-19)

Follow the steps in order. Field names are Dokploy's own (docs.dokploy.com, checked 2026-09-25). The project layout is decision **D6** (`TASKS.md`). File storage (**D3**, AWS S3) is wired in Phase 1 (P1-05), so staging runs **without S3** for now: leave every `S3_*` value empty.

**You need:** a Dokploy server with the GitHub provider connected to `tolakang/medusa-apps` (Dokploy → Git → GitHub App), and two hostnames. Either use your DNS (`api.staging.<your-domain>`, `shop.staging.<your-domain>` → the Dokploy server IP), or use Dokploy's **Generated** domains.

**Hosts in use (owner, 2026-09-29):** `<api host>` = `e-api.nokor24.com`, `<shop host>` = `e-shop.nokor24.com` (earlier `api2.nokor24.com` / `shop2.nokor24.com`). Changing hosts means: backend `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `STOREFRONT_URL` (and `MEDUSA_BACKEND_URL` if set); worker `STOREFRONT_URL`; storefront build args `NEXT_PUBLIC_MEDUSA_BACKEND_URL` and `NEXT_PUBLIC_BASE_URL` (rebuild); the Domains tab of both apps; and the customer bot's webhook (`telegram-set-webhook.js https://<api host>/telegram/webhook`, TASKS P1-17).

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
   - **Health Check** (form fields; verified healthy on staging 2026-09-27, finding F-021). **Test Commands** takes one array item per box, so use exactly **two** boxes:
     1. `CMD-SHELL`
     2. `node -e "fetch('http://localhost:9000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`

     Interval `30000000000`, Timeout `10000000000`, Start Period `120000000000`, Retries `3`, then **Save Health Check**.
     Don't paste a JSON array into one box (Docker gets one invalid item and never runs the check), and don't use `CMD` with the whole command in one box (Docker tries to run the whole line as a program). Both leave the task stuck in "Starting" or unhealthy. Check on the server after a deploy: `docker ps --filter name=<service> --format '{{.Names}} {{.Status}}'` must show `(healthy)`.
   - **Update Config**
     ```json
     { "Parallelism": 1, "Delay": 10000000000, "FailureAction": "rollback", "Order": "start-first" }
     ```
     Newer Dokploy versions show **form fields** instead of a JSON box. Enter the same values: Parallelism `1`, Delay `10000000000`, Failure Action **Rollback**, Monitor `10000000000`, Max Failure Ratio `0`, Order **Start First**, then **Save Update Config**. Grey text in a field is only a placeholder, not a saved value. On staging the two dropdowns show blank again after a successful save, but the values are stored (finding F-020, confirmed on the server 2026-09-27). To check the live value on the server: `docker service inspect <service> --format '{{json .Spec.UpdateConfig}}'` (Dokploy applies it on the next deploy).
   - Keep **Replicas = 1** (one migrating server per deploy, plan §8).
8. **Deploy.** Wait for the deployment to finish, then open `https://<api host>/health` → it must say `OK` (HTTP 200).
9. **First admin user.** Open the backend's terminal in Dokploy and run (the terminal opens in `/`. Images built before the entrypoint `cd /app` fix need `cd /app &&` in front):
   ```bash
   docker-entrypoint.sh medusa user -e <your-email> -p <password>
   ```
10. **Staging demo data** (region, stock location, shipping, 4 products; it reuses the store, sales channel and publishable key Medusa created on first boot). In the same terminal:
    ```bash
    docker-entrypoint.sh medusa exec ./src/scripts/seed-initial-data.js
    ```
    **Real shop (Cambodia):** run the production seed instead, or in addition on staging: `docker-entrypoint.sh medusa exec ./src/scripts/seed.js`. It creates the Cambodia region (USD checkout), store currencies USD (default) + KHR, a Cambodia tax region without a rate, a Phnom Penh stock location and one flat "Phnom Penh Delivery" option (placeholder $1.50; change rates and add options in the admin). It adds no products and is safe to re-run. Set the storefront's `NEXT_PUBLIC_DEFAULT_REGION=kh`.
    Then log in at `https://<api host>/app` → **Settings → Publishable API Keys** and copy the token (`pk_…`) of the one key there. Databases seeded before the F-017 fix have two keys and two "Default Sales Channel"s: pick the key whose channel shows products.

## 3. Worker: `ecommerce-worker`

1. **Create Service → Application**, name `ecommerce-worker`. Use the **same** provider, branch, Build Path (`/`), Build Type, Docker File (`ecommerce/backend/Dockerfile`), Context (`ecommerce/backend`) and **Watch Paths `ecommerce/backend/**`** as the backend. Don't leave Watch Paths empty: an empty box redeploys the worker on every push to `main` (finding F-019).
2. **Environment:** the same variables as the backend, with these three changed:
   ```
   MEDUSA_WORKER_MODE=worker
   DISABLE_MEDUSA_ADMIN=true
   RUN_MIGRATIONS=false
   ```
   Notification keys (`RESEND_API_KEY`, `RESEND_FROM`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, TASKS P1-04) go on **both** apps: the worker runs the `order.placed` subscriber. Empty = that channel only logs. Enter them only in Dokploy, never in chat or git.
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
   REVALIDATE_SECRET=<same value as on the backend and worker>
   ```
   The public API URL is fine for staging. The backend's internal hostname also works (starter change 6), but only use it once you have confirmed the exact name.
   **Cache refresh (TASKS P1-10):** generate one secret (`openssl rand -hex 32`) and set it as `REVALIDATE_SECRET` here **and** on `ecommerce-backend` and `ecommerce-worker`, together with `STOREFRONT_URL=https://<shop host>` on those two. Then admin changes to products, variants, categories, collections and regions show in the shop within seconds, and anything else (e.g. price lists) within 10 minutes. Check: `curl -s -X POST https://<shop host>/api/revalidate` must answer `401` (the route exists and wants the secret).
4. **Domains:** host `<shop host>`, path `/`, **container port `8000`**, HTTPS as for the backend.
5. **Swarm Settings → Health Check.** `/favicon.ico` bypasses the middleware, so the check doesn't depend on the backend.
   **Health Check** (form fields; verified healthy on staging 2026-09-27, finding F-021). **Test Commands** takes one array item per box, so use exactly **two** boxes:
     1. `CMD-SHELL`
     2. `node -e "fetch('http://localhost:8000/favicon.ico').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`

     Interval `30000000000`, Timeout `10000000000`, Start Period `60000000000`, Retries `3`, then **Save Health Check**.
     Don't paste a JSON array into one box (Docker gets one invalid item and never runs the check), and don't use `CMD` with the whole command in one box (Docker tries to run the whole line as a program). Both leave the task stuck in "Starting" or unhealthy. Check on the server after a deploy: `docker ps --filter name=<service> --format '{{.Names}} {{.Status}}'` must show `(healthy)`.
   **Update Config:** same as the backend (`start-first`, `rollback`), including the form-field note there.
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
3. **Automatic rollback.** Dokploy's documented rollback without a registry is the Swarm health check. In `ecommerce-storefront` → Swarm Settings → Health Check, temporarily change `favicon.ico` to `does-not-exist` inside the second Test Commands box and **Deploy**. The new task fails its health check, Swarm rolls back, and `https://<shop host>/` keeps working the whole time. Then **restore** `favicon.ico` and deploy again.
   **Needs a shell on the Dokploy server** to prove the rollback: the Dokploy UI can report such a deployment as successful (upstream issue Dokploy/dokploy#3987), and the Update Config dropdowns may not show their saved value (F-020). Before and after the test run:
   ```bash
   docker service inspect <storefront service> --format '{{json .Spec.UpdateConfig}}'
   docker service inspect <storefront service> --format '{{json .UpdateStatus}}'
   docker service ps <storefront service> --no-trunc
   ```
   Pass = `FailureAction` is `rollback`, `UpdateStatus.State` ends as `rollback_completed`, the new tasks show as failed/unhealthy, and the old task keeps running while the site answers 200 throughout.
   Passed on staging 2026-09-27 (TASKS P0-19): rollback took about 2.5 min (60 s start period + 3 failed checks). The Dokploy **Deployments tab still shows the rolled-back deploy as "Done"**, so after any deploy check `UpdateStatus` on the server, not the tab.
   **Restore afterwards:** Swarm rolls back, but Dokploy keeps `does-not-exist` saved, and the next deploy (including an auto-deploy from a push) would send it again. Put `favicon.ico` back, **Save Health Check**, reopen to confirm, and deploy.
4. Tell me the result of each step. I tick P0-18 / P0-19 in `TASKS.md` with this evidence, then run the phase exit checklist (P0-20).

**If anything fails:** send the deployment's log lines around the error. Don't retry with changed settings first. Same rule as `DEV_FLOW.md` §6.

---

## 7. Database backups and restore (TASKS P1-09)

Set up and tested on staging 2026-10-03. Backups hold customer names, phones, addresses and orders: treat the bucket and its key like a password.

### 7.1 Storage: a private bucket and its own key
1. RustFS console: create a bucket for backups only (staging: `dokploy-kt`). **Private**: no anonymous or public-read policy. Never use the shop's public image bucket.
2. Create an access key that can only reach that bucket: `s3:ListBucket` on `arn:aws:s3:::<bucket>`, and `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:AbortMultipartUpload` on `arn:aws:s3:::<bucket>/*`.
3. Dokploy → **Settings → S3 Destinations → Create** (staging: `S3-e-commerce`): Provider **Any other S3 compatible provider**, the key, **Bucket** `<bucket>`, **Region** `us-east-1`, **Endpoint** the RustFS **S3 API** address (staging `https://s3-rustfs.ktola.org`), **Additional Flags**:
   - `--streaming-upload-cutoff=200M`: Dokploy streams the dump into `rclone rcat`, which otherwise uses a multipart upload; RustFS before the scanner fix (rustfs/rustfs#6135, fixed by PR #6624, in 1.0.0+) refuses to complete multipart uploads with `503 Bucket quota check temporarily unavailable`. Below 200 MB the upload is one request. Optional once RustFS is 1.0.0 or newer.

   **Test connection** must succeed. It only checks that the bucket can be listed, not that uploads work: always do a manual run (7.2).

### 7.2 The backup
**ecommerce-postgres → Backups → Create Backup**:

| Field | Value |
|---|---|
| Destination | the destination from 7.1 |
| Database | the **Database Name** from the Postgres **General** tab (`ecommerce`), not the service name |
| Schedule | `0 19 * * *` (daily 19:00 UTC = 02:00 Cambodia) |
| Prefix Destination | `ecommerce-staging` (no leading `/`, no bucket name) |
| Keep the latest | `14` |
| Enabled | on |

Files land in `<bucket>/<postgres service name>/<prefix>/<UTC time>.sql.gz`: Dokploy adds the service-name folder itself. Each file is `pg_dump -Fc --no-acl --no-owner … | gzip` (from Dokploy's backup log), i.e. a **gzipped custom-format** dump, restored with `pg_restore`.

**Check every new setup with a manual run** (▶ on the backup row), then on the server:
```bash
f=$(ls -t /etc/dokploy/logs/backup-*/*.log | head -1); grep -v -i "secret\|access-key" "$f" | tail -8
```
It must end with `✅ Backup uploaded to S3 successfully`, and the file must appear in the bucket. Dokploy's own service log (`docker service logs dokploy`) prints the full upload command **including the S3 keys**: never paste it anywhere without removing that line.

### 7.3 Restore test (proves the backup is usable; do it after setup and before going live)
Restores into a **throwaway** Postgres container on the server. The live database is not touched.

1. **Get the newest backup onto the server.** RustFS console → the backup folder → download the newest `.sql.gz` to your computer, then copy it to the server:
   ```bash
   scp ~/Downloads/<file>.sql.gz root@<server>:/root/restore-test.sql.gz
   ```
2. **Start a scratch Postgres with the same major version** (staging runs Postgres 18; `pg_restore` must be at least the version that made the dump):
   ```bash
   docker run -d --name restore-test -e POSTGRES_PASSWORD=restore-test postgres:18
   sleep 8
   docker exec restore-test createdb -U postgres scratch
   ```
3. **Restore:**
   ```bash
   gunzip -c /root/restore-test.sql.gz | docker exec -i restore-test pg_restore -U postgres -d scratch --no-owner --no-acl
   ```
   No output means it worked. Warnings about extensions or comments are harmless; any `ERROR` line is not: send it.
4. **Check the data is really there** (compare with the admin):
   ```bash
   docker exec restore-test psql -U postgres -d scratch -c 'select count(*) as orders, max(display_id) as last_order from "order";'
   docker exec restore-test psql -U postgres -d scratch -c 'select count(*) as products from product where deleted_at is null;'
   ```
   `last_order` must equal the newest order number in the admin at the time of the backup.
5. **Clean up** (the file and container hold customer data):
   ```bash
   docker rm -f restore-test
   rm /root/restore-test.sql.gz
   ```
   Also delete the downloaded copy on your computer.

### 7.4 Real disaster recovery (only when the live data is lost or broken)
Dokploy → **ecommerce-postgres → Backups → Restore Backup** restores a chosen file **into the live database, replacing what is there**. Before using it: **Stop** the backend and the worker (no writes during the restore), take note of what will be lost (everything after the backup time), restore, then **Deploy** backend and worker and check `/health` and the latest order in the admin. Practice it on staging, never first on production.
