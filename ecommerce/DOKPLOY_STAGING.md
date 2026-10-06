# Runbook: `ecommerce-staging` on Dokploy (tasks P0-18, P0-19)

Follow the steps in order. Field names are Dokploy's own (docs.dokploy.com, checked 2026-09-25). The project layout is decision **D6** (`TASKS.md`). Sections 1–6 are the Phase 0 base setup. **Phase 1 features** (S3 file storage, upload limits, email and Telegram notifications, ABA PayWay, cache refresh) add the variables in step 2.5 and the go-live steps in **§8**. Backups are **§7**; the smoke test after every deploy is **§9**.

**You need:** a Dokploy server with the GitHub provider connected to `<github-owner>/medusa-apps` (Dokploy → Git → GitHub App), and two hostnames. Either use your DNS (`api.staging.<your-domain>`, `shop.staging.<your-domain>` → the Dokploy server IP), or use Dokploy's **Generated** domains.

**Placeholders:** `<api host>` and `<shop host>` are your backend and storefront hostnames; the examples in this repo use `api.staging.example.com` / `shop.staging.example.com` for staging and `api.example.com` / `shop.example.com` for production. Changing hosts means: backend `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `STOREFRONT_URL` (and `MEDUSA_BACKEND_URL` if set); worker `STOREFRONT_URL`; storefront build args `NEXT_PUBLIC_MEDUSA_BACKEND_URL` and `NEXT_PUBLIC_BASE_URL` (rebuild); the Domains tab of both apps; and the customer bot's webhook (`telegram-set-webhook.js https://<api host>/telegram/webhook`, TASKS P1-17).

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
   (Generated domains are HTTP. Then use `http://` in the three CORS values.)

   **Phase 1 variables** (add below the block above; each group is optional, and an empty group turns that feature off or makes it only log). Meaning of every value: `ecommerce/backend/.env.example`. Secrets go only here, never in chat or git.
   ```
   # File storage (P1-05): RustFS / SeaweedFS / AWS S3, one bucket per shop and environment
   S3_FILE_URL=https://<public storage host>/<bucket>
   S3_ACCESS_KEY_ID=<key>
   S3_SECRET_ACCESS_KEY=<secret>
   S3_REGION=us-east-1
   S3_BUCKET=<bucket>
   S3_ENDPOINT=<storage API URL>
   S3_FORCE_PATH_STYLE=true
   S3_ACL=false
   # Admin upload limits (P1-11, P1-12); empty = 0.8 MB default, 5 MB ceiling
   UPLOAD_MAX_FILE_SIZE_MB=
   UPLOAD_MAX_FILE_SIZE_CEILING_MB=
   # Order emails (P1-04)
   RESEND_API_KEY=<Resend key>
   RESEND_FROM=My Shop <orders@<verified domain>>
   RESEND_FROM_ACCOUNT=My Shop <verify@<verified domain>>   # account emails (P1-18); empty = RESEND_FROM
   # CAPTCHA (P1-21), server only; must match the storefront's NEXT_PUBLIC_CAPTCHA_PROVIDER
   CAPTCHA_PROVIDER=                 # recaptcha | turnstile | empty = off
   CAPTCHA_SECRET_KEY=               # turnstile: secret key
   RECAPTCHA_PROJECT_ID=             # recaptcha: Google Cloud project ID
   RECAPTCHA_API_KEY=                # recaptcha: API key (reCAPTCHA Enterprise API)
   RECAPTCHA_SITE_KEY=               # recaptcha: key ID (score-based)
   # Staff Telegram alerts (P1-04)
   TELEGRAM_BOT_TOKEN=<staff bot token>
   TELEGRAM_CHAT_ID=<staff group id, negative>
   # Customer Telegram updates (P1-17): a separate bot
   TELEGRAM_CUSTOMER_BOT_TOKEN=<customer bot token>
   TELEGRAM_CUSTOMER_BOT_USERNAME=<customer bot username, without @>
   TELEGRAM_CUSTOMER_WEBHOOK_SECRET=<openssl rand -hex 32>
   # ABA PayWay (P1-03); empty API URL = sandbox
   PAYWAY_MERCHANT_ID=<merchant id>
   PAYWAY_API_KEY=<the "Public Key" from ABA's email>
   PAYWAY_API_URL=
   PAYWAY_RETURN_URL=https://<api host>/hooks/payment/payway_payway
   # Storefront cache refresh (P1-10), PayWay's return to the shop, and the
   # links in verification / password reset emails (P1-18)
   STOREFRONT_URL=https://<shop host>
   REVALIDATE_SECRET=<openssl rand -hex 32, same on worker and storefront>
   ```
   PayWay notes (P1-03, checked on staging 2026-10-03): `PAYWAY_API_KEY` is the **Public Key** (40 characters), on one line with no quotes or spaces. `PAYWAY_API_URL` is only the base (`https://checkout.payway.com.kh` for live), **never** the full purchase URL. The RSA keys are not used. Check the lengths from the backend terminal without printing the values:
   ```bash
   node -e 'for (const k of ["PAYWAY_MERCHANT_ID","PAYWAY_API_KEY","PAYWAY_API_URL","PAYWAY_RETURN_URL"]) console.log(k, (process.env[k]||"").length)'
   ```
   **Build Time Arguments:** empty, unless you raise the upload ceiling above 5 MB: then also add `UPLOAD_MAX_FILE_SIZE_CEILING_MB=<same value>` here and **Rebuild**, because the admin's own size check is baked in at build time (F-027).

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
   Copy **all** the Phase 1 variables from step 2.5 to the worker too: it sends the order emails and Telegram messages, handles PayWay's callback and calls the storefront's cache refresh. Only the two `UPLOAD_*` values may be left out (uploads never reach the worker). Enter them only in Dokploy, never in chat or git.
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
   NEXT_PUBLIC_DEFAULT_REGION=kh
   NEXT_PUBLIC_STRIPE_KEY=
   NEXT_PUBLIC_CAPTCHA_PROVIDER=     # P1-21: same as the backend's CAPTCHA_PROVIDER
   NEXT_PUBLIC_CAPTCHA_SITE_KEY=     # recaptcha: key ID; turnstile: site key
   S3_IMAGE_HOSTNAME=<host part of the backend's S3_FILE_URL>
   S3_IMAGE_PATHNAME=/**
   ```
   (`kh` is the Cambodia region from `seed.js`, step 2.10. A database with only the demo seed has no `kh`: use one of its countries, e.g. `dk`, until you run `seed.js`. `NEXT_PUBLIC_STRIPE_KEY` stays empty: payments go through ABA PayWay, F-022.)
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
6. **Deploy.** Open `https://<shop host>/`: it redirects to `/kh` (or the region you set) and shows the store.

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
1. RustFS console: create a bucket for backups only (staging: `ecommerce-backups`). **Private**: no anonymous or public-read policy. Never use the shop's public image bucket.
2. Create an access key that can only reach that bucket: `s3:ListBucket` on `arn:aws:s3:::<bucket>`, and `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:AbortMultipartUpload` on `arn:aws:s3:::<bucket>/*`.
3. Dokploy → **Settings → S3 Destinations → Create** (staging: `ecommerce-backups-s3`): Provider **Any other S3 compatible provider**, the key, **Bucket** `<bucket>`, **Region** `us-east-1`, **Endpoint** the RustFS **S3 API** address (staging `https://s3.storage.example.com`), **Additional Flags**:
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
It must end with `✅ Backup uploaded to S3 successfully`, and the file must appear in the bucket. Dokploy **before v0.29.9** prints the full upload command **including the S3 keys** in its own service log (`docker service logs dokploy`; Dokploy/dokploy#4621, fixed by PR #4648). Staging still did on 2026-10-03, so its Dokploy is older: **update Dokploy (Settings → Web Server → Update) before production**, then rotate the backup key once more. Even after the update, never paste a log anywhere without filtering it.

### 7.3 Restore test (proves the backup is usable; do it after setup and before going live)
Restores into a **throwaway** database. The live database is not touched. Use **A** (done on staging 2026-10-04); **B** needs the file copied to the server over SSH.

**A. With Dokploy (no file copy)**
1. **Create Service → Database → PostgreSQL**: name `ecommerce-restore-test`, Database Name `ecommerce`, Docker image `postgres:18` (type it; grey text is only a placeholder). **Create**, then **Deploy**, and check `docker service ls | grep -i restore` shows `1/1` (Dokploy's restore fails with "no such service" on a service that was never deployed).
2. Open **`ecommerce-restore-test`** (check the name at the top of the page; never the live service) → **Backups → Restore Backup**: the destination, the newest file (type `<postgres service name>/` in the search box), Database Name `ecommerce`, **Restore**. The log must end with `Restore completed successfully!`. The file list keeps "Loading…" while the storage server is unreachable.
3. Check, on the server:
   ```bash
   c=$(docker ps --format '{{.Names}}' | grep restoretest | head -1); echo "$c"; docker exec "$c" sh -c 'psql -U "$POSTGRES_USER" -d ecommerce -c "select count(*) as orders, max(display_id) as last_order from \"order\";" -c "select count(*) as products from product where deleted_at is null;"'
   ```
   `last_order` must equal the newest order in the admin at the backup time.
4. Delete the `ecommerce-restore-test` service (it holds customer data).

**B. In the terminal**

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

---

## 8. Phase 1 go-live steps (once per project; repeat for production)

Do these after the backend, worker and storefront are deployed with the step 2.5 variables. Production (TASKS P1-08) uses its own project, hosts, bucket, bots and **live** PayWay credentials.

1. **Cambodia shop data.** If not done in step 2.10: `docker-entrypoint.sh medusa exec ./src/scripts/seed.js` in the backend terminal, and the storefront's `NEXT_PUBLIC_DEFAULT_REGION=kh` (rebuild).
2. **ABA PayWay.**
   - Ask ABA to **whitelist** the shop and API hosts and the Dokploy server's public IP (sandbox and live are separate). Without it PayWay answers `6: wrong domain`.
   - Admin → **Settings → Regions → Cambodia → Payment providers**: add **payway** (`pp_payway_payway`) and save. Without this the checkout shows no ABA PayWay option.
   - Test: pay one order with the sandbox success card (PayWay Resources page). The order must show as **Paid** (captured), and the backend log a `POST /hooks/payment/payway_payway` with 200. Never scan the sandbox KHQR with a real banking app.
   - Refunds are not automatic yet: refund in the PayWay merchant portal, then record it in the admin.
3. **Customer Telegram bot webhook** (once, and again after a host change). In the **backend** terminal (it already has the bot token and secret):
   ```bash
   docker-entrypoint.sh medusa exec ./src/scripts/telegram-set-webhook.js https://<api host>/telegram/webhook
   ```
   The log must end with `Telegram webhook set to https://<api host>/telegram/webhook`. Test: place an order, tap **Get order updates on Telegram** on the confirmation page, press Start in the bot: the "order confirmed" message arrives.
4. **Notifications check.** One test order must send the customer email (if an email was given), the staff Telegram alert, and, after fulfil → ship → deliver in the admin, the staff and customer updates.
5. **Uploads.** Upload a product image of a few MB in the admin: it must be stored in the bucket and show in the shop.
6. **Cache refresh.** `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<shop host>/api/revalidate` answers `401`. A product price change shows in the shop within seconds.
7. **Backups.** Set up §7.1–7.2 and run the §7.3 restore test once before taking real orders.
8. **CAPTCHA** (P1-21) on sign-in, sign-up and forgot password. Set the **storefront build args and the backend variables together** (a backend with CAPTCHA and a storefront without it refuses every sign-in), then rebuild the storefront and redeploy the backend.
   - **Google reCAPTCHA** (current version, Google Cloud): Google Cloud console → **Security → reCAPTCHA** (Fraud Defense) → create a **website key**, *score-based* (no checkbox), domains `<shop host>`; copy its **key ID**. Enable the **reCAPTCHA Enterprise API**, create an **API key** restricted to that API. Set `CAPTCHA_PROVIDER=recaptcha`, `RECAPTCHA_PROJECT_ID`, `RECAPTCHA_API_KEY`, `RECAPTCHA_SITE_KEY=<key ID>` on the backend, and `NEXT_PUBLIC_CAPTCHA_PROVIDER=recaptcha`, `NEXT_PUBLIC_CAPTCHA_SITE_KEY=<key ID>` on the storefront. 10,000 checks a month are free; enable billing before going over, or sign-ins are refused.
   - **Cloudflare Turnstile** (free): Cloudflare dashboard → **Turnstile** → add a widget for `<shop host>` (mode *Managed*); `CAPTCHA_PROVIDER=turnstile`, `CAPTCHA_SECRET_KEY=<secret>` on the backend; `NEXT_PUBLIC_CAPTCHA_PROVIDER=turnstile`, `NEXT_PUBLIC_CAPTCHA_SITE_KEY=<site key>` on the storefront.
   - Check: sign-in, sign-up and Forgot password still work in the shop; `curl -s -X POST https://<api host>/auth/customer/emailpass -H 'content-type: application/json' -d '{"email":"x@example.com","password":"x"}'` answers `Please complete the security check and try again.`

---

## 9. Smoke test after every deploy

CI proves the code (tests, image build, `/health` on an empty database). This checks the **deployed** shop with its real settings. Run it on staging after every deploy, before promoting to production, and on production right after its deploy (BUILD_PLAN §8 "smoke test, then production"). Stop at the first ❌ and send the output; don't change settings first (DEV_FLOW §6).

This adds no delay to the deploy itself: it is what you check once Dokploy shows the deploy as done, while the shop keeps running. Pick the size:

| Check | Takes you | When |
|---|---|---|
| **Quick** | about 1 minute | small changes (texts, styling, docs-only deploys): the four `curl` lines below and a look at the shop |
| **Full** | about 5–10 minutes | before promoting to production, every production deploy, and any backend change touching payments, notifications, migrations or env values: everything below |

**From your computer** (replace the hosts; nothing secret in these):
```bash
curl -s -o /dev/null -w 'health %{http_code}\n' https://<api host>/health
curl -s -o /dev/null -w 'admin %{http_code}\n' https://<api host>/app/
curl -s -o /dev/null -w 'shop %{http_code}\n' -L https://<shop host>/
curl -s -o /dev/null -w 'revalidate %{http_code}\n' -X POST https://<shop host>/api/revalidate
```
✅ `health 200`, `admin 200`, `shop 200`, `revalidate 401` (the route is there and wants the secret).

**On the server** (prove the new version really runs: the Dokploy Deployments tab can show "Done" for a rolled-back deploy, P0-19):
```bash
for s in $(docker service ls --format '{{.Name}}' | grep ecommerce); do echo "$s $(docker service inspect $s --format '{{if .UpdateStatus}}{{.UpdateStatus.State}}{{else}}no-update{{end}}')"; done
docker ps --filter name=ecommerce --format '{{.Names}} {{.Status}}'
```
✅ Each deployed service shows `completed` (not `rollback_completed`), and backend and storefront show `(healthy)`. Then each app's **Logs** in Dokploy, since the deploy:
- backend: `Server is ready on port: 9000`, migrations `Completed successfully` or `up-to-date`, no `error` lines;
- worker: `Starting Medusa (worker mode: worker)`, the three Redis connections, no `error` lines.

When sharing a log, filter it first: `grep -v -i "secret\|access-key\|api_key"`.

**In the browser:**
1. **Admin** `https://<api host>/app`: log in; Orders and Products open.
2. **Shop** `https://<shop host>/kh`: the home page and one product page show images and prices; search finds a product (e.g. "shirt").
3. **Checkout** with a Cambodian address and phone, up to **Pay with ABA PayWay**: PayWay's own checkout page opens (not raw JSON, not "wrong domain"; that proves the keys, signing and whitelisting).
   - **Staging:** pay with the sandbox success card. ✅ The confirmation page shows the order, the admin shows it as **Captured**, and the staff Telegram group gets the new-order alert (plus the email, if one was given).
   - **Production:** press **Cancel** on the PayWay page instead; you return to checkout, no order. Pay for real only when you mean to (a test purchase must be refunded in the PayWay merchant portal, refunds aren't automatic yet).
4. **Only after a backend deploy that touched notifications, Telegram or PayWay:** on that staging order, tap **Get order updates on Telegram** → the bot confirms; fulfil and ship it in the admin → staff and customer get "shipped".

Record the result (date, commit, ✅ per line) in `TASKS.md` for releases that matter (phase exit, production).
