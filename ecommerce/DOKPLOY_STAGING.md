# Runbook: `ecommerce-staging` on Dokploy (TASKS P0-18, P0-19, P1-09)

A step-by-step setup and operations guide for the Ecommerce business project on Dokploy. Field names are Dokploy's own (docs.dokploy.com, checked 2026-09-25). The project layout is decision **D6** (`TASKS.md`). Everything here was verified on the live staging; the finding numbers (F-0xx) point to the evidence in `TASKS.md`.

**Section numbers are stable.** Other files cite them (e.g. "runbook §2.5", "§7.2", "§9"), so new material goes inside a section, never as a renumbering.

| § | What | When |
|---|---|---|
| [0](#0-before-you-start) | Hosts, placeholders, secrets | once |
| [1](#1-project-and-databases) | Project, Postgres, Redis | once |
| [2](#2-backend-server-ecommerce-backend) | Backend server `ecommerce-backend` | once |
| [3](#3-worker-ecommerce-worker) | Worker `ecommerce-worker` | once |
| [4](#4-storefront-ecommerce-storefront) | Storefront `ecommerce-storefront` | once |
| [5](#5-p0-18-check-send-me-these-and-i-verify-from-here) | P0-18 check | after §1–§4 |
| [6](#6-p0-19-independence-and-rollback) | Independence and rollback | after §5 |
| [7](#7-database-backups-and-restore-tasks-p1-09) | Backups and restore | before real orders |
| [8](#8-phase-1-go-live-steps) | Phase 1 go-live steps | once per project |
| [9](#9-smoke-test-after-every-deploy) | Smoke test | after every deploy |
| [10](#10-rotating-a-leaked-secret) | Rotating a leaked secret | when needed |
| [11](#11-production-tasks-p1-08) | Production | P1-08 |

**Never paste secret values** in chat, git or tickets: keys, passwords, connection URLs, tokens. When you share a log, filter it first: `grep -v -i "secret\|access-key\|api_key"`.

---

## 0. Before you start

### 0.1 You need
- A Dokploy server, with the GitHub provider connected to `<github-owner>/medusa-apps` (Dokploy → **Git** → **GitHub App**).
- Two hostnames, either:
  - your DNS: `api.staging.<your-domain>` and `shop.staging.<your-domain>`, each an **A record** to the Dokploy server's IP; or
  - Dokploy's **Generated** domains (HTTP only: then use `http://` in every URL below).

### 0.2 Placeholders
- `<api host>` = the backend's hostname, `<shop host>` = the storefront's.
- Examples in this repo: `api.staging.example.com` / `shop.staging.example.com` for staging, `api.example.com` / `shop.example.com` for production.
- **Changing a host later** means updating all of these:
  - backend: `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `STOREFRONT_URL` (and `MEDUSA_BACKEND_URL` if set);
  - worker: `STOREFRONT_URL`;
  - storefront build args: `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_BASE_URL` (then **Rebuild**);
  - the **Domains** tab of both apps;
  - the customer bot's webhook (`telegram-set-webhook.js https://<api host>/telegram/webhook`, TASKS P1-17, §8 step 3).

### 0.3 Values to generate
On your own machine (never commit them), and save each in your password manager:
```bash
openssl rand -base64 32   # JWT_SECRET
openssl rand -base64 32   # COOKIE_SECRET
openssl rand -hex 32      # AUTH_MFA_ENCRYPTION_KEY (admin 2FA; never change it later)
openssl rand -hex 32      # REVALIDATE_SECRET (backend, worker, storefront)
openssl rand -hex 32      # SHOPPER_IP_SECRET (backend, storefront)
```

---

## 1. Project and databases

### 1.1 Project
1. Dokploy → **Projects** → **Create Project**.
2. Name: `ecommerce-staging` → **Create**.

### 1.2 Postgres
1. In the project: **Create Service** → **Database** → **Postgres**.
2. Name `ecommerce-postgres`, **Database Name** `ecommerce`.
3. **Create**, then **Deploy**.
4. **General** tab → copy the **Internal Connection URL**.
5. Leave **External Credentials** **off** (it opens port 5432 to the internet; it was found open and closed on 2026-10-03, P1-09).

### 1.3 Redis
1. **Create Service** → **Database** → **Redis**, name `ecommerce-redis`.
2. **Deploy**, then copy its **Internal Connection URL**.

**Check:** both services run (green).

---

## 2. Backend server: `ecommerce-backend`

### 2.1 Create the app
**Create Service** → **Application**, name `ecommerce-backend` → **Create**.

### 2.2 Source
**General** → **Provider: GitHub**:

| Field | Value |
|---|---|
| Repository | `medusa-apps` |
| Branch | `main` |
| **Build Path** | `/` |
| Trigger Type | `On Push` |

### 2.3 Build
**Build Type: Dockerfile**:

| Field | Value |
|---|---|
| **Docker File** | `ecommerce/backend/Dockerfile` |
| **Docker Context Path** | `ecommerce/backend` |
| Docker Build Stage | empty |

Both paths are relative to the repo root (verified on staging 2026-09-25, F-011).

### 2.4 Watch Paths
`ecommerce/backend/**`. Write the `/**` glob: a bare `ecommerce/backend/` may not match changed files.

### 2.5 Environment variables
1. **Environment** → **Environment Variables** (runtime). Paste this and replace every `<…>`:
   ```
   NODE_ENV=production
   PORT=9000
   DATABASE_URL=<Postgres Internal Connection URL>   # must start with postgres:// or postgresql://
   DATABASE_SSL=false
   REDIS_URL=<Redis Internal Connection URL>
   MEDUSA_FF_CACHING=true
   JWT_SECRET=<generated>
   AUTH_MFA_ENCRYPTION_KEY=<generated, 64 hex characters>   # admin 2FA (P1-22); set on backend AND worker; never change once used
   COOKIE_SECRET=<generated>
   STORE_CORS=https://<shop host>
   ADMIN_CORS=https://<api host>
   AUTH_CORS=https://<api host>,https://<shop host>
   MEDUSA_BACKEND_URL=
   DISABLE_MEDUSA_ADMIN=false
   MEDUSA_WORKER_MODE=server
   RUN_MIGRATIONS=true
   ```
   Generated domains are HTTP: then use `http://` in the three CORS values.

2. **Phase 1 variables.** Add them below the block above.
   - Each group is optional. An empty group turns that feature off, or makes it only log.
   - The meaning of every value is in `ecommerce/backend/.env.example`.
   - Secrets go only here, never in chat or git.
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
   # Anti-abuse (P1-21): per-IP limits on customer auth are built in; set this
   # only behind another proxy (e.g. Cloudflare orange cloud: cf-connecting-ip)
   CLIENT_IP_HEADER=
   SHOPPER_IP_SECRET=<openssl rand -hex 32, same on the storefront>   # shoppers' IPs for the limits
   UNVERIFIED_ACCOUNT_RETENTION_DAYS=   # worker: delete never-verified sign-ups after N days (default 28)
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

3. **PayWay notes** (P1-03, checked on staging 2026-10-03):
   - `PAYWAY_API_KEY` is the **Public Key** (40 characters), on one line with no quotes or spaces.
   - `PAYWAY_API_URL` is only the base (`https://checkout.payway.com.kh` for live), **never** the full purchase URL.
   - The RSA keys are not used.
   - Check the lengths from the backend terminal without printing the values:
     ```bash
     node -e 'for (const k of ["PAYWAY_MERCHANT_ID","PAYWAY_API_KEY","PAYWAY_API_URL","PAYWAY_RETURN_URL"]) console.log(k, (process.env[k]||"").length)'
     ```

4. **Build Time Arguments:** empty. The one exception is raising the upload ceiling above 5 MB: then also add `UPLOAD_MAX_FILE_SIZE_CEILING_MB=<same value>` here and **Rebuild**, because the admin's own size check is built in at build time (F-027).

5. **Check before saving:** `DATABASE_URL` comes from **`ecommerce-postgres`** and `REDIS_URL` from **`ecommerce-redis`**. A Redis URL in `DATABASE_URL` makes migrations hang for 60 s with `Knex: Timeout acquiring a connection`, and the domain shows Bad Gateway (seen on staging, F-012).

### 2.6 Domain
**Domains** → **Add Domain**:

| Field | Value |
|---|---|
| Host | `<api host>` |
| Path | `/` |
| **Container Port** | `9000` |
| HTTPS | on (Let's Encrypt), if you use your own DNS |

### 2.7 Swarm settings
**Advanced** → **Cluster Settings** → **Swarm Settings**. The image has no `curl`, so the health check uses Node's `fetch`.

**A. Health Check** (form fields; verified healthy on staging 2026-09-27, F-021)
1. **Test Commands** takes one array item per box. Use exactly **two** boxes:
   1. `CMD-SHELL`
   2. `node -e "fetch('http://localhost:9000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`
2. Interval `30000000000`, Timeout `10000000000`, Start Period `120000000000`, Retries `3` → **Save Health Check**.
3. **Don't:**
   - paste a JSON array into one box (Docker gets one invalid item and never runs the check);
   - use `CMD` with the whole command in one box (Docker tries to run the whole line as a program).

   Both leave the task stuck in "Starting" or unhealthy.
4. After a deploy, on the server:
   ```bash
   docker ps --filter name=<service> --format '{{.Names}} {{.Status}}'
   ```
   It must show `(healthy)`.

**B. Update Config**
1. As JSON (older Dokploy):
   ```json
   { "Parallelism": 1, "Delay": 10000000000, "FailureAction": "rollback", "Order": "start-first" }
   ```
2. Newer Dokploy shows **form fields** instead. Enter the same values:

   | Field | Value |
   |---|---|
   | Parallelism | `1` |
   | Delay | `10000000000` |
   | Failure Action | **Rollback** |
   | Monitor | `10000000000` |
   | Max Failure Ratio | `0` |
   | Order | **Start First** |

   → **Save Update Config**.
3. Grey text in a field is only a placeholder, not a saved value.
4. On staging the two dropdowns show blank again after a successful save, but the values are stored (F-020, confirmed on the server 2026-09-27).
5. To check the live value on the server (Dokploy applies it on the next deploy):
   ```bash
   docker service inspect <service> --format '{{json .Spec.UpdateConfig}}'
   ```

**C. Replicas** = `1` (one migrating server per deploy, plan §8).

### 2.8 Deploy
1. **Deploy**, and wait for the deployment to finish.
2. Open `https://<api host>/health`.

**Check:** it says `OK` (HTTP 200).

### 2.9 First admin user
1. Open the backend's **Terminal** in Dokploy. It opens in `/`. Images built before the entrypoint `cd /app` fix need `cd /app &&` in front.
2. Run:
   ```bash
   docker-entrypoint.sh medusa user -e <your-email> -p <password>
   ```

### 2.10 Data and publishable key
1. **Staging demo data**: a region, a stock location, shipping and 4 products. It reuses the store, sales channel and publishable key Medusa created on first boot. In the same terminal:
   ```bash
   docker-entrypoint.sh medusa exec ./src/scripts/seed-initial-data.js
   ```
2. **Real shop (Cambodia):** run the production seed instead, or in addition on staging:
   ```bash
   docker-entrypoint.sh medusa exec ./src/scripts/seed.js
   ```
   - It creates the Cambodia region (USD checkout), store currencies USD (default) + KHR, a Cambodia tax region without a rate, a Phnom Penh stock location, and one flat "Phnom Penh Delivery" option (placeholder $1.50; change rates and add options in the admin).
   - It adds no products and is safe to re-run.
   - Set the storefront's `NEXT_PUBLIC_DEFAULT_REGION=kh`.
3. **Publishable key:**
   1. Log in at `https://<api host>/app` → **Settings** → **Publishable API Keys**.
   2. Copy the token (`pk_…`) of the one key there.
   3. Databases seeded before the F-017 fix have two keys and two "Default Sales Channel"s: pick the key whose channel shows products.

**Check:** you can log in to the admin, and **Products** lists the seeded products.

---

## 3. Worker: `ecommerce-worker`

### 3.1 Create the app
1. **Create Service** → **Application**, name `ecommerce-worker`.
2. Use the **same** settings as the backend:

   | Field | Value |
   |---|---|
   | Provider, Branch | GitHub, `main` |
   | Build Path | `/` |
   | Build Type | Dockerfile |
   | Docker File | `ecommerce/backend/Dockerfile` |
   | Docker Context Path | `ecommerce/backend` |
   | **Watch Paths** | `ecommerce/backend/**` |

   Don't leave Watch Paths empty: an empty box redeploys the worker on every push to `main` (F-019).

### 3.2 Environment
1. The **same** variables as the backend, with these three changed:
   ```
   MEDUSA_WORKER_MODE=worker
   DISABLE_MEDUSA_ADMIN=true
   RUN_MIGRATIONS=false
   ```
2. Copy **all** the Phase 1 variables from step 2.5 to the worker too. The worker sends the order emails and Telegram messages, handles PayWay's callback and calls the storefront's cache refresh.
3. Only the two `UPLOAD_*` values may be left out (uploads never reach the worker).
4. Enter them only in Dokploy, never in chat or git.

### 3.3 Swarm settings
1. **No domain. No health check.** Medusa still opens its HTTP listener in worker mode (the log shows `Server is ready on port: 9000`), but it is internal only and not routed, so nothing needs to probe it.
2. **Update Config:**
   ```json
   { "Parallelism": 1, "Delay": 10000000000, "FailureAction": "rollback", "Order": "stop-first" }
   ```
   Form fields: as the backend (step 2.7.B), with Order **Stop First**. `stop-first` = never two workers at once during a deploy.

### 3.4 Deploy
**Deploy**, only after the backend is healthy, because the worker relies on its migrations.

**Check:** **Logs** show, with no errors:
- `[entrypoint] Starting Medusa (worker mode: worker)`
- the Redis connections for `event-bus-redis`, `locking-redis` and `workflow-engine-redis`
- `Server is ready on port: 9000`

---

## 4. Storefront: `ecommerce-storefront`

### 4.1 Create the app

| Field | Value |
|---|---|
| Name | `ecommerce-storefront` |
| Provider, Branch | GitHub, `main` |
| **Build Path** | `/` |
| Build Type | Dockerfile |
| **Docker File** | `ecommerce/storefront/Dockerfile` |
| **Docker Context Path** | `ecommerce/storefront` |
| **Watch Paths** | `ecommerce/storefront/**` |

### 4.2 Build Time Arguments
These are built into the bundle; changing one = redeploy.
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
- `kh` is the Cambodia region from `seed.js` (step 2.10). A database with only the demo seed has no `kh`: use one of its countries (e.g. `dk`) until you run `seed.js`.
- `NEXT_PUBLIC_STRIPE_KEY` stays empty: payments go through ABA PayWay (F-022).

### 4.3 Environment Variables (runtime)
```
NODE_ENV=production
PORT=8000
MEDUSA_BACKEND_URL=https://<api host>
REVALIDATE_SECRET=<same value as on the backend and worker>
SHOPPER_IP_SECRET=<same value as on the backend>
CLIENT_IP_HEADER=                 # only behind another proxy (Cloudflare: cf-connecting-ip)
```
- **Per-shopper limits** (P1-21): sign-in, sign-up and password emails run on the storefront's server, so the backend would see one IP for every shopper, and one bot could lock everyone out. With the same `SHOPPER_IP_SECRET` on the storefront and the backend, the storefront forwards each shopper's IP and the backend trusts it only with that secret.
- **Backend URL:** the public API URL is fine for staging. The backend's internal hostname also works (starter change 6), but only use it once you have confirmed the exact name.
- **Cache refresh** (P1-10):
  - Generate one secret (`openssl rand -hex 32`). Set it as `REVALIDATE_SECRET` here **and** on `ecommerce-backend` and `ecommerce-worker`, together with `STOREFRONT_URL=https://<shop host>` on those two.
  - Then admin changes to products, variants, categories, collections and regions show in the shop within seconds; anything else (e.g. price lists) within 10 minutes.
  - Check: `curl -s -X POST https://<shop host>/api/revalidate` must answer `401` (the route exists and wants the secret).

### 4.4 Domain

| Field | Value |
|---|---|
| Host | `<shop host>` |
| Path | `/` |
| **Container Port** | `8000` |
| HTTPS | as for the backend |

### 4.5 Swarm settings
**A. Health Check.** `/favicon.ico` bypasses the middleware, so the check doesn't depend on the backend (F-021). Use exactly **two** boxes:
1. `CMD-SHELL`
2. `node -e "fetch('http://localhost:8000/favicon.ico').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`

Interval `30000000000`, Timeout `10000000000`, Start Period `60000000000`, Retries `3` → **Save Health Check**. The same don'ts and the same `docker ps` check as the backend (step 2.7.A).

**B. Update Config:** as the backend (`start-first`, `rollback`), including the form-field notes in step 2.7.B.

### 4.6 Deploy and check
1. **Deploy**.
2. Open `https://<shop host>/`: it redirects to `/kh` (or the region you set) and shows the store.
3. **Checks that catch the staging mistakes seen so far:**
   - The key must see products. Medusa's own default key sees **0** (F-017):
     ```bash
     curl -s -H "x-publishable-api-key: <pk_…>" https://<api host>/store/products?fields=handle | head -c 200
     ```
     `"count":0` means the wrong key: use the one linked to the seed's **Default Sales Channel**.
   - The URL actually built in. A typo in a build-time argument only shows up as a 500 on every page (F-016). In the storefront terminal:
     ```bash
     grep -oE 'https?://[A-Za-z0-9._:-]+' /app/.next/server/src/middleware.js | sort -u
     ```
     It must print `https://<api host>`.

---

## 5. P0-18 check: send me these, and I verify from here

**Reply with:**
- **`<api host>`** and **`<shop host>`**;
- which Dockerfile path setting worked.

I then check:

| Check | Pass |
|---|---|
| `GET https://<api host>/health` | 200 |
| `GET https://<api host>/app/` | 200 |
| Store API with your publishable key | returns the products |
| `https://<shop host>/` | redirects to the region (`/kh`, or `/dk` on demo data only) |
| a product page | renders server-side |
| CORS | storefront origin accepted by the API |

---

## 6. P0-19: independence and rollback
You click; I verify.

### 6.1 Redeploy each app alone
1. In `ecommerce-storefront`, click **Deploy**.
2. Afterwards, `ecommerce-backend` and `ecommerce-worker` must show **no new deployment** in their **Deployments** tab.
3. Repeat with the worker, then the backend.

### 6.2 Watch paths
I push a harmless commit that touches only `ecommerce/storefront/` (a comment). Only `ecommerce-storefront` should auto-deploy.

### 6.3 Automatic rollback
Dokploy's documented rollback without a registry is the Swarm health check.

1. **Break it on purpose:** `ecommerce-storefront` → **Swarm Settings** → **Health Check**. In the second Test Commands box, change `favicon.ico` to `does-not-exist` → **Save Health Check** → **Deploy**.
2. **Expected:** the new task fails its health check, Swarm rolls back, and `https://<shop host>/` keeps working the whole time.
3. **Prove it on the server.** This needs a shell, because the Dokploy UI can report such a deployment as successful (Dokploy/dokploy#3987), and the Update Config dropdowns may not show their saved value (F-020). Run this before and after the test:
   ```bash
   docker service inspect <storefront service> --format '{{json .Spec.UpdateConfig}}'
   docker service inspect <storefront service> --format '{{json .UpdateStatus}}'
   docker service ps <storefront service> --no-trunc
   ```
   **Pass:**
   - `FailureAction` is `rollback`;
   - `UpdateStatus.State` ends as `rollback_completed`;
   - the new tasks show as failed/unhealthy;
   - the old task keeps running, and the site answers 200 throughout.
4. **Restore afterwards.** Swarm rolls back, but Dokploy keeps `does-not-exist` saved, and the next deploy (including an auto-deploy from a push) would send it again. Put `favicon.ico` back → **Save Health Check** → reopen to confirm → **Deploy**.

**Passed on staging 2026-09-27** (P0-19). The rollback took about 2.5 minutes (60 s start period + 3 failed checks). The Dokploy **Deployments tab still shows the rolled-back deploy as "Done"**, so after any deploy check `UpdateStatus` on the server, not the tab.

### 6.4 Report
Tell me the result of each step. I tick P0-18 / P0-19 in `TASKS.md` with this evidence, then run the phase exit checklist (P0-20).

**If anything fails:** send the deployment's log lines around the error. Don't retry with changed settings first (`DEV_FLOW.md` §6).

---

## 7. Database backups and restore (TASKS P1-09)

Set up and tested on staging 2026-10-03. Backups hold customer names, phones, addresses and orders, so treat the bucket and its key like a password.

### 7.1 Storage: a private bucket and its own key
1. **Bucket.** RustFS console → create a bucket for backups only (staging: `ecommerce-backups`).
   - **Private**: no anonymous or public-read policy.
   - Never use the shop's public image bucket.
2. **Key.** Create an access key that can only reach that bucket:

   | Action | Resource |
   |---|---|
   | `s3:ListBucket` | `arn:aws:s3:::<bucket>` |
   | `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:AbortMultipartUpload` | `arn:aws:s3:::<bucket>/*` |
3. **Destination.** Dokploy → **Settings** → **S3 Destinations** → **Create** (staging: `ecommerce-backups-s3`):

   | Field | Value |
   |---|---|
   | Provider | **Any other S3 compatible provider** |
   | Access key / secret | the key from step 2 |
   | **Bucket** | `<bucket>` |
   | **Region** | `us-east-1` |
   | **Endpoint** | the RustFS **S3 API** address (staging `https://s3.storage.example.com`) |
   | **Additional Flags** | `--streaming-upload-cutoff=200M` |

   Why the flag: Dokploy streams the dump into `rclone rcat`, which otherwise uses a multipart upload. RustFS before the scanner fix (rustfs/rustfs#6135, fixed by PR #6624, in 1.0.0+) refuses to complete multipart uploads with `503 Bucket quota check temporarily unavailable`. Below 200 MB the upload is one request. The flag is optional once RustFS is 1.0.0 or newer.
4. **Test connection** must succeed. It only checks that the bucket can be listed, not that uploads work, so always do a manual run (7.2).

### 7.2 The backup
1. **ecommerce-postgres** → **Backups** → **Create Backup**:

   | Field | Value |
   |---|---|
   | Destination | the destination from 7.1 |
   | Database | the **Database Name** from the Postgres **General** tab (`ecommerce`), not the service name |
   | Schedule | `0 19 * * *` (daily 19:00 UTC = 02:00 Cambodia) |
   | Prefix Destination | `ecommerce-staging` (no leading `/`, no bucket name) |
   | Keep the latest | `14` |
   | Enabled | on |
2. **Where files land:** `<bucket>/<postgres service name>/<prefix>/<UTC time>.sql.gz`. Dokploy adds the service-name folder itself.
3. **Format:** each file is `pg_dump -Fc --no-acl --no-owner … | gzip` (from Dokploy's backup log), i.e. a **gzipped custom-format** dump, restored with `pg_restore`.
4. **Check every new setup with a manual run** (▶ on the backup row), then on the server:
   ```bash
   f=$(ls -t /etc/dokploy/logs/backup-*/*.log | head -1); grep -v -i "secret\|access-key" "$f" | tail -8
   ```
   **Check:** it ends with `✅ Backup uploaded to S3 successfully`, and the file appears in the bucket.
5. **Dokploy before v0.29.9 leaks the S3 keys.** It prints the full upload command, **including the S3 keys**, in its own service log (`docker service logs dokploy`; Dokploy/dokploy#4621, fixed by PR #4648). Staging still did on 2026-10-03, so its Dokploy is older.
   - **Update Dokploy** (**Settings** → **Web Server** → **Update**) **before production**, then rotate the backup key once more (§10).
   - Even after the update, never paste a log anywhere without filtering it.

### 7.3 Restore test
This proves the backup is usable; do it after setup and before going live. It restores into a **throwaway** database, so the live database is not touched. Use **A** (done on staging 2026-10-04). **B** needs the file copied to the server over SSH.

**A. With Dokploy (no file copy)**
1. **Create the throwaway database.** **Create Service** → **Database** → **PostgreSQL**:
   - name `ecommerce-restore-test`, Database Name `ecommerce`;
   - Docker image `postgres:18` (type it; grey text is only a placeholder);
   - **Create**, then **Deploy**.

   Check that `docker service ls | grep -i restore` shows `1/1`. Dokploy's restore fails with "no such service" on a service that was never deployed.
2. **Restore into it.** Open **`ecommerce-restore-test`**. Check the name at the top of the page: never the live service. Then **Backups** → **Restore Backup**:
   - the destination;
   - the newest file (type `<postgres service name>/` in the search box);
   - Database Name `ecommerce`;
   - **Restore**.

   **Check:** the log ends with `Restore completed successfully!`. The file list keeps "Loading…" while the storage server is unreachable.
3. **Check the data**, on the server:
   ```bash
   c=$(docker ps --format '{{.Names}}' | grep restoretest | head -1); echo "$c"; docker exec "$c" sh -c 'psql -U "$POSTGRES_USER" -d ecommerce -c "select count(*) as orders, max(display_id) as last_order from \"order\";" -c "select count(*) as products from product where deleted_at is null;"'
   ```
   **Check:** `last_order` equals the newest order in the admin at the backup time.
4. **Delete** the `ecommerce-restore-test` service (it holds customer data).

**B. In the terminal**
1. **Get the newest backup onto the server.** RustFS console → the backup folder → download the newest `.sql.gz` to your computer, then copy it to the server:
   ```bash
   scp ~/Downloads/<file>.sql.gz root@<server>:/root/restore-test.sql.gz
   ```
2. **Start a scratch Postgres with the same major version.** Staging runs Postgres 18; `pg_restore` must be at least the version that made the dump.
   ```bash
   docker run -d --name restore-test -e POSTGRES_PASSWORD=restore-test postgres:18
   sleep 8
   docker exec restore-test createdb -U postgres scratch
   ```
3. **Restore:**
   ```bash
   gunzip -c /root/restore-test.sql.gz | docker exec -i restore-test pg_restore -U postgres -d scratch --no-owner --no-acl
   ```
   No output means it worked. Warnings about extensions or comments are harmless; any `ERROR` line is not, so send it.
4. **Check the data is really there** (compare with the admin):
   ```bash
   docker exec restore-test psql -U postgres -d scratch -c 'select count(*) as orders, max(display_id) as last_order from "order";'
   docker exec restore-test psql -U postgres -d scratch -c 'select count(*) as products from product where deleted_at is null;'
   ```
   **Check:** `last_order` equals the newest order number in the admin at the time of the backup.
5. **Clean up** (the file and container hold customer data):
   ```bash
   docker rm -f restore-test
   rm /root/restore-test.sql.gz
   ```
   Also delete the downloaded copy on your computer.

### 7.4 Real disaster recovery
Only when the live data is lost or broken. Dokploy → **ecommerce-postgres** → **Backups** → **Restore Backup** restores a chosen file **into the live database, replacing what is there**.
1. **Stop** the backend and the worker (no writes during the restore).
2. Note what will be lost: everything after the backup time.
3. Restore.
4. **Deploy** the backend and the worker.
5. Check `/health` and the latest order in the admin.

Practice it on staging; never do it first on production.

---

## 8. Phase 1 go-live steps
Once per project; repeat for production. Do these after the backend, worker and storefront are deployed with the step 2.5 variables. Production (P1-08) uses its own project, hosts, bucket, bots and **live** PayWay credentials.

1. **Cambodia shop data.** If not done in step 2.10:
   - run `docker-entrypoint.sh medusa exec ./src/scripts/seed.js` in the backend terminal;
   - set the storefront's `NEXT_PUBLIC_DEFAULT_REGION=kh` (rebuild).
2. **ABA PayWay.**
   1. Ask ABA to **whitelist** the shop and API hosts and the Dokploy server's public IP (sandbox and live are separate). Without it PayWay answers `6: wrong domain`.
   2. Admin → **Settings** → **Regions** → **Cambodia** → **Payment providers**: add **payway** (`pp_payway_payway`) → save. Without this the checkout shows no ABA PayWay option.
   3. **Test:** pay one order with the sandbox success card (PayWay Resources page). **Check:** the order shows as **Paid** (captured), and the backend logs a `POST /hooks/payment/payway_payway` with 200. Never scan the sandbox KHQR with a real banking app.
   4. Refunds are not automatic yet: refund in the PayWay merchant portal, then record it in the admin.
3. **Customer Telegram bot webhook.** Once, and again after a host change. In the **backend** terminal (it already has the bot token and secret):
   ```bash
   docker-entrypoint.sh medusa exec ./src/scripts/telegram-set-webhook.js https://<api host>/telegram/webhook
   ```
   **Check:** the log ends with `Telegram webhook set to https://<api host>/telegram/webhook`.

   **Test:** place an order → tap **Get order updates on Telegram** on the confirmation page → press Start in the bot → the "order confirmed" message arrives.
4. **Notifications check.** One test order must send:
   - the customer email (if an email was given);
   - the staff Telegram alert;
   - after fulfil → ship → deliver in the admin, the staff and customer updates.
5. **Uploads.** Upload a product image of a few MB in the admin. **Check:** it's stored in the bucket and shows in the shop.
6. **Cache refresh.**
   - `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<shop host>/api/revalidate` answers `401`.
   - A product price change shows in the shop within seconds.
7. **Backups.** Set up §7.1–7.2 and run the §7.3 restore test once, before taking real orders.
8. **CAPTCHA** (P1-21) on sign-in, sign-up and forgot password.
   - Set the **storefront build args and the backend variables together**: a backend with CAPTCHA and a storefront without it refuses every sign-in. Then rebuild the storefront and redeploy the backend.
   - **Google reCAPTCHA** (current version, Google Cloud):
     1. Google Cloud console → **Security** → **reCAPTCHA** (Fraud Defense) → create a **website key**, *score-based* (no checkbox), domains `<shop host>`. Copy its **key ID**.
     2. Enable the **reCAPTCHA Enterprise API**, and create an **API key** restricted to that API.
     3. Backend: `CAPTCHA_PROVIDER=recaptcha`, `RECAPTCHA_PROJECT_ID`, `RECAPTCHA_API_KEY`, `RECAPTCHA_SITE_KEY=<key ID>`.
     4. Storefront: `NEXT_PUBLIC_CAPTCHA_PROVIDER=recaptcha`, `NEXT_PUBLIC_CAPTCHA_SITE_KEY=<key ID>`.
     5. 10,000 checks a month are free. Enable billing before going over, or sign-ins are refused.
   - **Cloudflare Turnstile** (free):
     1. Cloudflare dashboard → **Turnstile** → add a widget for `<shop host>` (mode *Managed*).
     2. Backend: `CAPTCHA_PROVIDER=turnstile`, `CAPTCHA_SECRET_KEY=<secret>`.
     3. Storefront: `NEXT_PUBLIC_CAPTCHA_PROVIDER=turnstile`, `NEXT_PUBLIC_CAPTCHA_SITE_KEY=<site key>`.
   - **Check:**
     - sign-in, sign-up and Forgot password still work in the shop;
     - this answers `Please complete the security check and try again.`:
       ```bash
       curl -s -X POST https://<api host>/auth/customer/emailpass -H 'content-type: application/json' -d '{"email":"x@example.com","password":"x"}'
       ```
9. **Two-factor sign-in for every admin** (P1-22). Medusa has no setting that forces it, so make it a rule. With `AUTH_MFA_ENCRYPTION_KEY` set, each admin:
   1. opens the dashboard → **Settings** → **Profile** → **Two-factor authentication** → **Enable**;
   2. scans the QR code with an authenticator app (Google Authenticator, 1Password, …) and enters the 6-digit code;
   3. **downloads the recovery codes** and keeps them offline.

   From then on every admin sign-in asks for a code. "Lost access to your authenticator app? Use a recovery code" covers a lost phone. Switching 2FA off also asks for a code (`disable_policy: "challenge"`).

   **Check:** sign out and in again → the dashboard asks for the code.

---

## 9. Smoke test after every deploy

CI proves the code (tests, image build, `/health` on an empty database). This checks the **deployed** shop with its real settings.
- **When:** on staging after every deploy, before promoting to production, and on production right after its deploy (BUILD_PLAN §8 "smoke test, then production").
- **Rule:** stop at the first ❌ and send the output; don't change settings first (DEV_FLOW §6).
- It adds no delay to the deploy itself: it is what you check once Dokploy shows the deploy as done, while the shop keeps running.

**Pick the size:**

| Check | Takes you | When |
|---|---|---|
| **Quick** | about 1 minute | small changes (texts, styling, docs-only deploys): 9.1 and a look at the shop |
| **Full** | about 5–10 minutes | before promoting to production, every production deploy, and any backend change touching payments, notifications, migrations or env values: 9.1–9.3 |

### 9.1 From your computer
Replace the hosts; nothing secret in these:
```bash
curl -s -o /dev/null -w 'health %{http_code}\n' https://<api host>/health
curl -s -o /dev/null -w 'admin %{http_code}\n' https://<api host>/app/
curl -s -o /dev/null -w 'shop %{http_code}\n' -L https://<shop host>/
curl -s -o /dev/null -w 'revalidate %{http_code}\n' -X POST https://<shop host>/api/revalidate
```
✅ `health 200`, `admin 200`, `shop 200`, `revalidate 401` (the route is there and wants the secret).

### 9.2 On the server
This proves the new version really runs: the Dokploy Deployments tab can show "Done" for a rolled-back deploy (P0-19).
```bash
for s in $(docker service ls --format '{{.Name}}' | grep ecommerce); do echo "$s $(docker service inspect $s --format '{{if .UpdateStatus}}{{.UpdateStatus.State}}{{else}}no-update{{end}}')"; done
docker ps --filter name=ecommerce --format '{{.Names}} {{.Status}}'
```
✅ Each deployed service shows `completed` (not `rollback_completed`), and the backend and storefront show `(healthy)`.

Then check each app's **Logs** in Dokploy, since the deploy:
- **backend:** `Server is ready on port: 9000`, migrations `Completed successfully` or `up-to-date`, no `error` lines;
- **worker:** `Starting Medusa (worker mode: worker)`, the three Redis connections, no `error` lines.

When sharing a log, filter it first: `grep -v -i "secret\|access-key\|api_key"`.

### 9.3 In the browser
1. **Admin** `https://<api host>/app`: log in; Orders and Products open.
2. **Shop** `https://<shop host>/kh`: the home page and one product page show images and prices; search finds a product (e.g. "shirt").
3. **Checkout** with a Cambodian address and phone, up to **Pay with ABA PayWay**. PayWay's own checkout page must open: not raw JSON, not "wrong domain". That proves the keys, signing and whitelisting.
   - **Staging:** pay with the sandbox success card. ✅ The confirmation page shows the order, the admin shows it as **Captured**, and the staff Telegram group gets the new-order alert (plus the email, if one was given).
   - **Production:** press **Cancel** on the PayWay page instead; you return to checkout and no order is placed. Pay for real only when you mean to: a test purchase must be refunded in the PayWay merchant portal (refunds aren't automatic yet).
4. **Only after a backend deploy that touched notifications, Telegram or PayWay:**
   1. on that staging order, tap **Get order updates on Telegram** → the bot confirms;
   2. fulfil and ship it in the admin → staff and customer get "shipped".

### 9.4 Record
For releases that matter (phase exit, production), record the result in `TASKS.md`: the date, the commit, and ✅ per line.

---

## 10. Rotating a leaked secret

Do this whenever a key, password or token was pasted into chat, printed in a log or shared by mistake. Never paste the new values anywhere either.

**Still owed on staging:** one rotation of the Redis password (2026-09-25), the Resend key and the RustFS backup key (TASKS → *Session handoff*, operator notes).

### 10.0 Update Dokploy first
Back up first, then update Dokploy to **v0.29.9 or newer**. Older versions print the S3 backup keys in Dokploy's own service log (F-031, §7.2), so a new backup key would leak the same way.

### 10.1 Redis password
- [ ] `ecommerce-redis` → set a new password → **Deploy**.
- [ ] Copy its new **Internal Connection URL** into `REDIS_URL` on **`ecommerce-backend`** and **`ecommerce-worker`**. Both can't reach Redis until they are redeployed.
- [ ] Redeploy the backend: `/health` 200, no Redis errors in **Logs**.
- [ ] Redeploy the worker: `Starting Medusa (worker mode: worker)`, the three Redis connections, no `error` lines (§9).

### 10.2 Resend API key
- [ ] Resend dashboard → create a new API key (sending access is enough).
- [ ] Set `RESEND_API_KEY` on **`ecommerce-backend`** and **`ecommerce-worker`**, then redeploy both.
- [ ] Send a password reset email and place one sandbox order (with an email): both emails arrive.
- [ ] Only then delete the old key in Resend.

### 10.3 RustFS backup key
- [ ] RustFS console → create a new key limited to the backup bucket (same policy as §7.1 step 2).
- [ ] Dokploy → **Settings** → **S3 Destinations** → the backup destination (§7.1 step 3): enter the new key and secret → **Test connection**.
- [ ] Manual run (▶ on the backup row), and check the log as in §7.2: it must end with `✅ Backup uploaded to S3 successfully`, and the new file must appear in the bucket.
- [ ] Check that Dokploy no longer prints the key. This must print `0`:
  ```bash
  docker service logs dokploy 2>&1 | grep -c '<first 6 characters of the new key>'
  ```
- [ ] Delete the old key in RustFS.
- [ ] If the backend's file storage uses the same key pair (`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`), rotate it too: new key, update the backend, redeploy, upload one admin image and check it shows in the shop.

### 10.4 Close out
- [ ] Smoke test (§9).
- [ ] Record the date in `TASKS.md`, and remove the "rotate" line from the operator notes.
- [ ] Production (P1-08) gets fresh values for every secret; never reuse a staging one.

---

## 11. Production (TASKS P1-08)

Production is a **separate Dokploy project `ecommerce`**, built with §1–§4 and §8 of this runbook using production values (`ecommerce/README.md` → *Staging project* lists what differs). This section adds only what staging doesn't need.

### 11.1 Before you start
- [ ] Dokploy updated to v0.29.9 or newer (§10.0).
- [ ] Server hardened (plan §5 *Server access*):
  - SSH-key login only;
  - no password login for root or any uid-0 account (`kt`);
  - no public Postgres port;
  - OS updates applied, and the server restarted at a quiet time.
- [ ] Staging keys rotated (§10), so nothing leaked there is reused.
- [ ] The commit to release is green in CI and passed the smoke test (§9) on staging.

### 11.2 Values to collect
Fresh for production; never copy a staging value.
- [ ] **Domains:** `<api host>` and `<shop host>`, with DNS pointing at the Dokploy server.
- [ ] **Secrets:** new `JWT_SECRET`, `COOKIE_SECRET`, `AUTH_MFA_ENCRYPTION_KEY`, `REVALIDATE_SECRET` and `SHOPPER_IP_SECRET`, generated as in §0.3. The last two must match on backend and storefront.
- [ ] **Live ABA PayWay:**
  - `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`;
  - `PAYWAY_API_URL=https://checkout.payway.com.kh`;
  - `PAYWAY_RETURN_URL` on the production API host;
  - ABA has whitelisted both production hosts and the server's public IP (§8 step 2).
- [ ] **Storage:**
  - a production image bucket and key (`S3_*`, storefront `S3_IMAGE_HOSTNAME`);
  - a separate private backup bucket and key (§7.1).
- [ ] **Resend:** a sender on a verified domain (`RESEND_FROM`, `RESEND_FROM_ACCOUNT`) and its own API key.
- [ ] **Telegram:** a production staff bot and chat (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`), and a customer bot (`TELEGRAM_CUSTOMER_*`).
- [ ] **CAPTCHA** keys for `<shop host>` (§8 step 8).

### 11.3 Deploy
1. Follow §1–§4 in project `ecommerce`, with **Replicas = 1** on the backend server (plan R-h: two servers migrating at once is unsafe).
2. Run the §8 go-live steps 1–9. For the backup (step 7), use its own prefix (`ecommerce`), and do the §7.3 restore test before taking real orders.
3. Run the smoke test (§9) the **production** way: at checkout, press **Cancel** on the PayWay page. Pay for real only on purpose, then refund in the PayWay merchant portal.
4. Record the date, commit and ✅ per line in `TASKS.md` under P1-08.

### 11.4 Every later release (plan §8)
1. Deploy to staging first, and run the smoke test.
2. **Back up production** (▶ on the backup row, §7.2).
3. Keep the backend at **one** replica while it migrates, and deploy.
4. Run the smoke test (§9).

**Rollback** (plan §8) = redeploy the previous commit, plus `medusa db:rollback` of the migrated modules, or a restore of that backup.
