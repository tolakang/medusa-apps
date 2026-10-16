# Runbook: `pos-staging` on Dokploy (TASKS P2-14)

A complete, step-by-step setup of the POS business project on a Dokploy **staging** project. You don't need any other runbook for it. Follow the sections in order. Field names are Dokploy's own; they match what was verified on the Ecommerce staging (`../ecommerce/DOKPLOY_STAGING.md`, findings F-011, F-012, F-016, F-017, F-019, F-020, F-021).

What you end up with: one Dokploy project `pos-staging` with **6 services**.

| Service | What it is | Domain → container port |
|---|---|---|
| `pos-postgres` | database `pos` | none |
| `pos-redis` | cache, events, locks | none |
| `pos-backend` | Medusa server + admin | `<api host>` → 9000 |
| `pos-worker` | Medusa worker (same image) | none |
| `pos-storefront` | online shop | `<shop host>` → 8000 |
| `pos-pos-app` | till app (PWA) | `<till host>` → 3000 |

---

## 0. Before you start

**You need:**
- the Dokploy server, with the GitHub provider connected to `<github-owner>/medusa-apps` (Dokploy → Git → GitHub App);
- **three hostnames** pointing at the Dokploy server's IP, for example:
  - `<api host>` = `api.pos-staging.<your-domain>`
  - `<shop host>` = `shop.pos-staging.<your-domain>`
  - `<till host>` = `pos.pos-staging.<your-domain>`

  Or use Dokploy's **Generated** domains (HTTP only: then write `http://` instead of `https://` everywhere below).

**Generate these values** on your own machine, write them in your password manager, and never paste them in chat or commit them:
```bash
openssl rand -base64 32   # A  JWT_SECRET            (backend + worker)
openssl rand -base64 32   # B  COOKIE_SECRET         (backend + worker)
openssl rand -hex 32      # C  AUTH_MFA_ENCRYPTION_KEY (backend + worker; never change it later)
openssl rand -hex 32      # D  REVALIDATE_SECRET     (backend + worker + storefront)
openssl rand -hex 32      # E  SHOPPER_IP_SECRET     (backend + worker + storefront)
openssl rand -hex 32      # F  COOKIE_SECRET of the till app (pos-pos-app only; different from B)
```

**Optional services** (each can stay empty on staging; empty = that feature is off or only logs):
- S3 bucket for product images. Use a **separate** bucket from Ecommerce, e.g. `pos-staging`.
- Resend key and sender (order emails).
- Telegram staff bot + group (new-order alerts). Use a separate group from Ecommerce.
- ABA PayWay sandbox merchant ID + key (online payments).

---

## 1. Project and databases

1. Dokploy → **Create Project** → name `pos-staging`.
2. In it: **Create Service → Database → Postgres**:
   - name `pos-postgres`, **Database Name `pos`**, user and password as Dokploy suggests;
   - **Deploy**;
   - open its **General** tab and copy the **Internal Connection URL** (starts with `postgresql://`);
   - do **not** turn on External Credentials (that opens port 5432 to the internet).
3. **Create Service → Database → Redis**: name `pos-redis` → **Deploy** → copy its **Internal Connection URL** (starts with `redis://`).

## 2. Backend server: `pos-backend`

1. **Create Service → Application**, name `pos-backend`.
2. **General → Provider: GitHub**:
   - Repository `medusa-apps`, Branch `main`;
   - **Build Path `/`**;
   - Trigger Type **On Push**.
3. **Build Type: Dockerfile**:
   - **Docker File** `pos/backend/Dockerfile`;
   - **Docker Context Path** `pos/backend`;
   - Docker Build Stage empty.
4. **Watch Paths:** `pos/backend/**`. Write the `/**` glob; a bare folder name may not match.
5. **Environment → Environment Variables.** Paste this and replace every `<…>`:
   ```
   NODE_ENV=production
   PORT=9000
   DATABASE_URL=<pos-postgres Internal Connection URL>
   DATABASE_SSL=false
   REDIS_URL=<pos-redis Internal Connection URL>
   MEDUSA_FF_CACHING=true
   JWT_SECRET=<A>
   COOKIE_SECRET=<B>
   AUTH_MFA_ENCRYPTION_KEY=<C>
   STORE_CORS=https://<shop host>
   ADMIN_CORS=https://<api host>
   AUTH_CORS=https://<api host>,https://<shop host>,https://<till host>
   POS_CORS=https://<till host>
   MEDUSA_BACKEND_URL=
   DISABLE_MEDUSA_ADMIN=false
   MEDUSA_WORKER_MODE=server
   RUN_MIGRATIONS=true
   STOREFRONT_URL=https://<shop host>
   REVALIDATE_SECRET=<D>
   SHOPPER_IP_SECRET=<E>
   CLIENT_IP_HEADER=
   ```
   **Optional groups.** Add any you have, below the block above. The meaning of every value is in `pos/backend/.env.example`.
   ```
   # Product images (S3 / RustFS / SeaweedFS); empty S3_BUCKET = images on the container's disk (lost on redeploy)
   S3_FILE_URL=https://<public storage host>/<bucket>
   S3_ACCESS_KEY_ID=<key>
   S3_SECRET_ACCESS_KEY=<secret>
   S3_REGION=us-east-1
   S3_BUCKET=<bucket>
   S3_ENDPOINT=<storage API URL>
   S3_FORCE_PATH_STYLE=true
   S3_ACL=false
   # Order emails
   RESEND_API_KEY=<Resend key>
   RESEND_FROM=My Shop <orders@<verified domain>>
   RESEND_FROM_ACCOUNT=
   # Staff Telegram alerts
   TELEGRAM_BOT_TOKEN=<staff bot token>
   TELEGRAM_CHAT_ID=<staff group id, negative>
   # ABA PayWay sandbox; empty API URL = sandbox
   PAYWAY_MERCHANT_ID=<merchant id>
   PAYWAY_API_KEY=<the "Public Key" from ABA's email>
   PAYWAY_API_URL=
   PAYWAY_RETURN_URL=https://<api host>/hooks/payment/payway_payway
   ```
   **Check before saving:** `DATABASE_URL` must be the **Postgres** URL and `REDIS_URL` the **Redis** URL. Swapping them makes migrations hang with `Knex: Timeout acquiring a connection` and the domain shows Bad Gateway (F-012).

   **Build Time Arguments:** leave empty.
6. **Domains → Add Domain:**
   - host `<api host>`, path `/`;
   - **Container Port `9000`**;
   - HTTPS on, certificate Let's Encrypt.
7. **Advanced → Cluster Settings → Swarm Settings.**
   - **Health Check.** The image has no `curl`, so use Node.
     - **Test Commands** takes one item per box. Use exactly two boxes:
       1. `CMD-SHELL`
       2. `node -e "fetch('http://localhost:9000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`
     - Interval `30000000000`, Timeout `10000000000`, Start Period `120000000000`, Retries `3` → **Save Health Check**.
     - Don't paste a JSON array into one box, and don't use `CMD` with the whole line in one box. Both leave the task stuck in "Starting" (F-021).
   - **Update Config** (form fields): Parallelism `1`, Delay `10000000000`, Failure Action **Rollback**, Monitor `10000000000`, Max Failure Ratio `0`, Order **Start First** → **Save Update Config**. The two dropdowns may show blank again after saving; the values are stored (F-020).
   - **Replicas = 1.** Only one migrating server per deploy.
8. **Deploy.** Wait until it finishes (the first build takes several minutes), then open `https://<api host>/health`: it must show `OK`.
9. **First admin user.** Backend → **Terminal**, then:
   ```bash
   docker-entrypoint.sh medusa user -e <your-email> -p <a strong password>
   ```
10. **Staging data.** In the same terminal, run both seeds. The POS tests use exactly this data: demo products, the European Warehouse, and the Cambodia region with the Phnom Penh shop location in the default sales channel.
    ```bash
    docker-entrypoint.sh medusa exec ./src/scripts/seed-initial-data.js
    docker-entrypoint.sh medusa exec ./src/scripts/seed.js
    ```
11. **Publishable key.** Log in at `https://<api host>/app` → **Settings → Publishable API Keys**. There is one key, linked to the **Default Sales Channel** (your online channel). Copy its token `pk_…`. Check that it has exactly **one** sales channel; a key with two makes the shop's stock count fail (MEDUSA_SKILL §6).

## 3. Worker: `pos-worker`

1. **Create Service → Application** `pos-worker`. Same as the backend:
   - GitHub, `main`, **Build Path `/`**;
   - Dockerfile `pos/backend/Dockerfile`, Context `pos/backend`;
   - **Watch Paths `pos/backend/**`**. Never leave it empty: an empty box redeploys the worker on every push (F-019).
2. **Environment:** copy **all** the backend's variables, including the optional groups (the worker sends emails and Telegram alerts and handles PayWay callbacks). Then change three:
   ```
   MEDUSA_WORKER_MODE=worker
   DISABLE_MEDUSA_ADMIN=true
   RUN_MIGRATIONS=false
   ```
3. **No domain, no health check.** **Swarm → Update Config:** same as the backend but Order **Stop First**, so there are never two workers at once.
4. **Deploy**, but only after `pos-backend` is healthy, because the worker relies on its migrations. **Logs** must show:
   - `[entrypoint] Starting Medusa (worker mode: worker)`
   - Redis connected for `event-bus-redis`, `locking-redis` and `workflow-engine-redis`
   - `Server is ready on port: 9000`, with no errors

## 4. Online shop: `pos-storefront`

1. **Create Service → Application** `pos-storefront`:
   - GitHub, `main`, **Build Path `/`**;
   - Build Type **Dockerfile**: Docker File `pos/storefront/Dockerfile`, Context `pos/storefront`;
   - **Watch Paths `pos/storefront/**`**.
2. **Environment → Build Time Arguments.** These are baked into the bundle, so changing one means **Rebuild**.
   ```
   NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://<api host>
   NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<pk_… from step 2.11>
   NEXT_PUBLIC_BASE_URL=https://<shop host>
   NEXT_PUBLIC_DEFAULT_REGION=kh
   NEXT_PUBLIC_STRIPE_KEY=
   NEXT_PUBLIC_CAPTCHA_PROVIDER=
   NEXT_PUBLIC_CAPTCHA_SITE_KEY=
   S3_IMAGE_HOSTNAME=<host part of S3_FILE_URL, or empty>
   S3_IMAGE_PATHNAME=/**
   ```
3. **Environment → Environment Variables** (runtime):
   ```
   NODE_ENV=production
   PORT=8000
   MEDUSA_BACKEND_URL=https://<api host>
   REVALIDATE_SECRET=<D>
   SHOPPER_IP_SECRET=<E>
   CLIENT_IP_HEADER=
   ```
4. **Domains:** `<shop host>`, path `/`, **Container Port `8000`**, HTTPS.
5. **Swarm Settings:**
   - **Health Check:** two boxes. `/favicon.ico` doesn't depend on the backend.
     1. `CMD-SHELL`
     2. `node -e "fetch('http://localhost:8000/favicon.ico').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`

     Interval `30000000000`, Timeout `10000000000`, Start Period `60000000000`, Retries `3`.
   - **Update Config:** as the backend (Start First, Rollback).
6. **Deploy.** `https://<shop host>/` must redirect to `/kh` and show the shop.
   - The key must see products. This must print a non-zero `count` (F-017):
     ```bash
     curl -s -H "x-publishable-api-key: <pk_…>" "https://<api host>/store/products?fields=handle" | head -c 200
     ```
   - `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<shop host>/api/revalidate` must print `401`. That means the cache-refresh route is there and wants the secret.

## 5. Till app: `pos-pos-app`

1. **Create Service → Application** `pos-pos-app`:
   - GitHub, `main`, **Build Path `/`**;
   - Docker File `pos/pos-app/Dockerfile`, Context `pos/pos-app`;
   - **Watch Paths `pos/pos-app/**`**.
2. **Build Time Arguments:** none. The build calls no backend.
3. **Environment Variables** (runtime):
   ```
   NODE_ENV=production
   PORT=3000
   MEDUSA_BACKEND_URL=https://<api host>
   COOKIE_SECRET=<F>
   ```
   - `COOKIE_SECRET` seals the cashier's session cookie. Changing it later signs every till out.
   - The app calls the backend only from its own server. The browser never sees the token.
4. **Domains:** `<till host>`, path `/`, **Container Port `3000`**, HTTPS.
5. **Swarm Settings:**
   - **Health Check:** two boxes. The manifest needs no sign-in and no backend.
     1. `CMD-SHELL`
     2. `node -e "fetch('http://localhost:3000/manifest.webmanifest').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`

     Interval `30000000000`, Timeout `10000000000`, Start Period `60000000000`, Retries `3`.
   - **Update Config:** as the backend (Start First, Rollback).
6. **Deploy.** `https://<till host>/` must redirect to `/login` and show "POS counter".

**After all six are up**, on the Dokploy server (SSH):
```bash
docker ps --filter name=pos- --format '{{.Names}} {{.Status}}'
```
The backend, storefront and till app must show `(healthy)`, and the worker `Up`.

## 6. Set up the shop and make a test sale

### 6.1 Stock at the shop
1. Admin `https://<api host>/app` → **Inventory** → find **Medusa T-Shirt, L / Black** (SKU `SHIRT-L-BLACK`).
2. In its **Locations**, make sure **Phnom Penh** is listed (add it with *Manage locations* if not), and set its **In stock** to **10**.
3. **Settings → Locations & Shipping → Phnom Penh → Sales Channels** must list the **Default Sales Channel**. `seed.js` links it already.

### 6.2 Register and cashier (admin API)
There is no admin page for these yet, so use `curl` from your machine. Do this **before** you turn on 2FA for this admin; with 2FA, sign-in needs the code step.
```bash
API=https://<api host>
# 1. Admin token
TOKEN=$(curl -s -X POST $API/auth/user/emailpass -H 'content-type: application/json' \
  -d '{"email":"<your-email>","password":"<your password>"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
AUTH="authorization: Bearer $TOKEN"
# 2. IDs: the Phnom Penh location and the default (online) sales channel
curl -s -H "$AUTH" "$API/admin/stock-locations?fields=id,name"
curl -s -H "$AUTH" "$API/admin/sales-channels?fields=id,name"
# 3. The register (this also creates the hidden "In store (POS)" shipping option)
curl -s -X POST $API/admin/pos/registers -H "$AUTH" -H 'content-type: application/json' \
  -d '{"name":"Front till","code":"PP-1","stock_location_id":"<sloc_… of Phnom Penh>","sales_channel_id":"<sc_… of Default Sales Channel>"}'
# 4. Invite a cashier (any email you can type at the till; no email is sent)
curl -s -X POST $API/admin/pos/cashiers -H "$AUTH" -H 'content-type: application/json' \
  -d '{"name":"Test Cashier","email":"<cashier email>"}'
```
- Steps 3 and 4 must answer with a `register` and a `cashier` object.
- A `401` means the token is missing or expired; repeat step 1.

### 6.3 A sale at the till
1. Open `https://<till host>/login` → **First time? Set your password** → enter the cashier email from 6.2 and a password (8+ characters) twice → **Set password and sign in**.
2. **Choose a register:** *Front till* → **Opening cash** `20` → **Open shift**.
3. Type or scan `SHIRT-L-BLACK` (Enter) and make the quantity **2**. Then **Payment method: Cash**, **Cash received** e.g. the total rounded up, and **Complete sale**.
4. On **Sale complete**, note the **order number** and press **Print receipt** (printing to PDF is fine).
5. **Close shift.** Count the drawer: 20 plus the sale's total. Enter that amount in **Cash counted** and close. **Shift closed** must show variance **0.00**.
6. Admin → **Shift report** (sidebar, `/app/pos-shifts`): the closed shift of *Front till* shows expected = counted, variance 0.

## 7. Send me this, and I verify from here
Reply with **`<api host>`, `<shop host>`, `<till host>`** and the **order number** from 6.3. Never send keys or passwords. I will check:
- **API:** `/health` 200, `/app/` 200.
- **Online stock:** with your publishable key, `/store/products` shows the T-shirt L / Black at **8**, i.e. 10 minus the 2 sold at the till. This is the plan's acceptance on staging: the till took stock from the shop's location only.
- **Shop:** `/kh` and a product page render. The checkout's delivery options don't list "In store (POS)".
- **Till app:** `/login` 200; `/` redirects to `/login` without a session; `/manifest.webmanifest` 200.
- **CORS:** the API accepts the shop and till origins and refuses a foreign one.

Also send a screenshot of the **Shift report** row (variance 0).

## 8. Each app redeployed alone (independence)
1. Open `pos-storefront` → **Deploy**. When it's done, open the **Deployments** tab of `pos-backend`, `pos-worker` and `pos-pos-app`: none may have a new entry.
2. Repeat with `pos-pos-app`, then `pos-worker`, then `pos-backend`. Each time, the other three get no new deployment.
3. After each deploy, check that the shop, the till's `/login` and `/health` still answer.
4. Send me the result of each (e.g. "storefront alone: others unchanged, all OK"). I then tick P2-14 in `TASKS.md`.

The automatic **rollback** (a failing health check rolls back to the old container) was proven once for the whole repo in P0-19, and the POS apps use the same Swarm settings, so it isn't repeated here.

## 9. If something fails
- Send the deployment's **log lines around the error** (Dokploy → the app → Deployments → the failed one → View). Don't retry with changed settings first (`DEV_FLOW.md` §6).
- Known causes, from the Ecommerce staging:

| Symptom | Likely cause |
|---|---|
| Bad Gateway on the API; `Knex: Timeout acquiring a connection` | `DATABASE_URL` and `REDIS_URL` swapped or wrong (F-012) |
| Every shop page 500 | a typo in a storefront **build-time** argument; fix it and **Rebuild** (F-016) |
| Shop shows no products | wrong publishable key (F-017), or the key has two sales channels |
| Task stuck in "Starting" / never healthy | health check typed into one box, or `CMD` instead of `CMD-SHELL` (F-021) |
| Worker redeploys on every push | its Watch Paths box is empty (F-019) |
| Till sale: "Not enough stock at Phnom Penh" | 6.1 not done: the Phnom Penh location needs stock for that item |
| Till sale: "This register has no stock location" | the register was created without `stock_location_id` |
