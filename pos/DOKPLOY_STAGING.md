# Runbook: `pos-staging` on Dokploy (TASKS P2-14)

A click-by-click setup of the POS business project on a Dokploy **staging** project. You don't need any other runbook. Do the steps **in order**. Each step ends with **Check** (what you should see) and **Reply with** (what to send so I can verify from here). Field names are Dokploy's own. They were verified on the Ecommerce staging, findings F-011, F-012, F-016, F-017, F-019, F-020 and F-021 (`../ecommerce/DOKPLOY_STAGING.md`).

**Never paste secret values** in chat: keys, passwords, connection URLs, tokens. When a check needs one, the command prints only its length.

When you're done you have one Dokploy project, `pos-staging`, with **6 services**:

| Service | What it is | Domain → container port | Step |
|---|---|---|---|
| `pos-postgres` | database `pos` | none | 1 |
| `pos-redis` | cache, events, locks | none | 1 |
| `pos-backend` | Medusa server + admin | `<api host>` → 9000 | 2–3 |
| `pos-worker` | Medusa worker (same image) | none | 4 |
| `pos-storefront` | online shop | `<shop host>` → 8000 | 5 |
| `pos-pos-app` | till app (PWA) | `<till host>` → 3000 | 6 |

---

## Step 0: Decide and prepare (about 5 minutes)

### A. Hostnames
1. Pick three hostnames, for example:
   - `<api host>` = `api.pos-staging.<your-domain>`: backend and admin
   - `<shop host>` = `shop.pos-staging.<your-domain>`: online shop
   - `<till host>` = `pos.pos-staging.<your-domain>`: till app
2. At your DNS provider, create an **A record** for each one, pointing to the Dokploy server's IP. That's the same IP the Ecommerce staging uses.
3. **No DNS?** Use Dokploy's **Generated** domains instead. They are HTTP only, so write `http://` instead of `https://` everywhere below.

### B. Secrets
On your own computer, run this **six times**:
```bash
openssl rand -hex 32
```
Save each result in your password manager under these names:

| Name | Used as | On |
|---|---|---|
| A | `JWT_SECRET` | backend, worker |
| B | `COOKIE_SECRET` | backend, worker |
| C | `AUTH_MFA_ENCRYPTION_KEY` (never change it later) | backend, worker |
| D | `REVALIDATE_SECRET` | backend, worker, storefront |
| E | `SHOPPER_IP_SECRET` | backend, worker, storefront |
| F | `COOKIE_SECRET` of the till app (not the same as B) | till app |

### C. Optional extras (recommended: later)
- S3 images, Resend email, Telegram alerts and ABA PayWay can all be added after the core passes.
- Without them, product images stay on the container's disk (lost on redeploy), and email and Telegram only write to the log. Every POS check still works.
- If you add them later, use **separate** ones from Ecommerce: their own bucket (e.g. `pos-staging`) and their own Telegram group.

**Reply with:** the three hostnames (or "generated domains"), and "extras now" or "extras later".

---

## Step 1: Project and databases (about 5 minutes)

### A. Project
1. Dokploy → **Projects** → **Create Project**.
2. Name: `pos-staging` → **Create**.

### B. Postgres
1. Open `pos-staging` → **Create Service** → **Database** → **Postgres**.
2. Name: `pos-postgres`.
3. **Database Name:** `pos`. Keep the user and password Dokploy suggests.
4. **Create**, then **Deploy**.
5. **General** tab → copy the **Internal Connection URL** (it starts with `postgresql://`) into your password manager as **DB URL**.
6. Leave **External Credentials** **off**. Turning it on opens port 5432 to the internet.

### C. Redis
1. **Create Service** → **Database** → **Redis**.
2. Name: `pos-redis` → **Create** → **Deploy**.
3. **General** tab → copy the **Internal Connection URL** (it starts with `redis://`) into your password manager as **REDIS URL**.

**Check:** both services show as running (green).

**Reply with:** "Step 1 done".

---

## Step 2: Backend server `pos-backend` (about 20 minutes, mostly build time)

### A. Create the app and connect the code
1. In `pos-staging`: **Create Service** → **Application** → name `pos-backend` → **Create**.
2. **General** tab → **Provider: GitHub**:
   - Repository: `medusa-apps`
   - Branch: `main`
   - **Build Path:** `/` (just a slash)
   - Trigger Type: **On Push**
   - **Save**
3. **Build Type: Dockerfile**:
   - **Docker File:** `pos/backend/Dockerfile`
   - **Docker Context Path:** `pos/backend`
   - Docker Build Stage: leave empty
   - **Save**
4. **Watch Paths:** `pos/backend/**` (with `/**` at the end) → **Save**.

### B. Environment variables
1. **Environment** tab → **Environment Variables** box. Paste this, then replace every `<…>`:
   ```
   NODE_ENV=production
   PORT=9000
   DATABASE_URL=<DB URL from step 1.B>
   DATABASE_SSL=false
   REDIS_URL=<REDIS URL from step 1.C>
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
2. **Check two lines before saving:**
   - `DATABASE_URL` starts with `postgres`;
   - `REDIS_URL` starts with `redis`.

   Swapping them was the main mistake on the Ecommerce staging (F-012).
3. Generated domains: use `http://` in the six URLs.
4. Leave **Build Time Arguments** empty → **Save**.

**Optional extras** (only if you said "extras now"). Add these lines below the block, with the meaning of each in `pos/backend/.env.example`:
```
# Product images (S3 / RustFS / SeaweedFS)
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
# Staff Telegram alerts
TELEGRAM_BOT_TOKEN=<staff bot token>
TELEGRAM_CHAT_ID=<staff group id, negative>
# ABA PayWay sandbox (empty API URL = sandbox)
PAYWAY_MERCHANT_ID=<merchant id>
PAYWAY_API_KEY=<the "Public Key" from ABA's email>
PAYWAY_API_URL=
PAYWAY_RETURN_URL=https://<api host>/hooks/payment/payway_payway
```

### C. Domain and Swarm settings
1. **Domains** tab → **Add Domain**:
   - Host: `<api host>`, Path: `/`
   - **Container Port: `9000`**
   - HTTPS on, Certificate: **Let's Encrypt**
   - **Create**
2. **Advanced** → **Cluster Settings** → **Swarm Settings** → **Health Check**. **Test Commands** needs exactly **two boxes**:
   - box 1: `CMD-SHELL`
   - box 2: `node -e "fetch('http://localhost:9000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`

   Then set:
   - Interval `30000000000`
   - Timeout `10000000000`
   - Start Period `120000000000`
   - Retries `3`
   - **Save Health Check**

   Don't paste a JSON array into one box, and don't use `CMD`. Both leave the app stuck in "Starting" (F-021).
3. **Update Config:**
   - Parallelism `1`
   - Delay `10000000000`
   - Failure Action **Rollback**
   - Monitor `10000000000`
   - Max Failure Ratio `0`
   - Order **Start First**
   - **Save Update Config**

   **Failure Action** and **Order** show "Select…" again after saving. That's a Dokploy display quirk: the values are stored (F-020), and the number fields keeping their values show the save worked. To confirm, after the next deploy (Dokploy applies the setting then), run on the server:
   ```bash
   docker service inspect $(docker service ls --format '{{.Name}}' | grep pos-backend) --format '{{json .Spec.UpdateConfig}}'
   ```
   It must include `"FailureAction":"rollback"` and `"Order":"start-first"`. If they're missing, pick both dropdowns again, press **Save Update Config** (not **Clear**), and redeploy. The same check works for every app; use its name instead of `pos-backend`.
4. **Replicas:** `1`.

### D. Deploy and check
1. **Deploy**. The first build takes about 5–10 minutes.
2. **Logs** tab: near the end you see `Migrated` / `Completed successfully`, then `Server is ready on port: 9000`.
3. In the browser, open `https://<api host>/health`.

**Check:** the page shows **OK**.

**Reply with:**
- `<api host>`;
- what `/health` showed;
- if the deploy failed, the ~20 log lines around the first error. Logs never print the secrets.

---

## Step 3: Admin user, staging data and publishable key (about 10 minutes)

### A. First admin user
1. `pos-backend` → **Terminal** tab. It opens a shell in the running container.
2. Run this, with your own email and a strong password:
   ```bash
   docker-entrypoint.sh medusa user -e <your-email> -p '<a strong password>'
   ```
3. **Check:** it prints that the user was created.

### B. Staging data
In the same terminal, run both seeds, **one after the other**:
```bash
docker-entrypoint.sh medusa exec ./src/scripts/seed-initial-data.js
docker-entrypoint.sh medusa exec ./src/scripts/seed.js
```
- The first adds the demo products and the European Warehouse.
- The second adds the Cambodia region (USD), the **Phnom Penh** stock location in the default sales channel, and "Phnom Penh Delivery".
- The POS tests use exactly this data.

**Check:** both finish without an error. The second ends with a "Finished seeding" line.

### C. Publishable key (for the online shop)
1. Open `https://<api host>/app` and log in with the admin from 3.A.
2. **Settings** → **Publishable API Keys**. There is one key.
3. Open it. Under **Sales Channels** it must list exactly **one** channel, **Default Sales Channel**. A key with two channels makes the shop's stock counts fail with a 400 (MEDUSA_SKILL §6).
4. Copy its token (`pk_…`). This one is not secret: it is built into the shop's public code.

**Check:** you can log in to the admin, and **Products** shows the demo products (T-shirt, sweatshirt, …).

**Reply with:**
- "Step 3 done";
- the `pk_…` token. With it I check from here that the key sees the products.

---

## Step 4: Worker `pos-worker` (about 10 minutes)

### A. Create the app
1. **Create Service** → **Application** → name `pos-worker` → **Create**.
2. **General:**
   - Provider **GitHub**, Repository `medusa-apps`, Branch `main`;
   - **Build Path `/`**, Trigger **On Push**.
3. **Build Type: Dockerfile:**
   - Docker File `pos/backend/Dockerfile`
   - Docker Context Path `pos/backend`
4. **Watch Paths:** `pos/backend/**`. Never leave this box empty: an empty box redeploys the worker on every push (F-019).

### B. Environment
1. Copy **all** of `pos-backend`'s Environment Variables, including any optional extras. The worker sends the emails and Telegram alerts and handles PayWay callbacks.
2. Change exactly these three lines:
   ```
   MEDUSA_WORKER_MODE=worker
   DISABLE_MEDUSA_ADMIN=true
   RUN_MIGRATIONS=false
   ```
3. **Save**.

### C. Swarm settings
1. **No domain**, and **no health check**: the worker isn't reachable from outside.
2. **Update Config:** same as the backend (step 2.C.3), but Order **Stop First**, so there are never two workers at once → **Save Update Config**.

### D. Deploy and check
1. **Deploy**, only after `pos-backend` is healthy (the worker relies on its migrations).
2. **Logs** must show, with no errors:
   - `[entrypoint] Starting Medusa (worker mode: worker)`
   - Redis connected for `event-bus-redis`, `locking-redis` and `workflow-engine-redis`
   - `Server is ready on port: 9000`

**Reply with:** "Step 4 done", or the log lines around the first error.

---

## Step 5: Online shop `pos-storefront` (about 15 minutes)

### A. Create the app
1. **Create Service** → **Application** → name `pos-storefront` → **Create**.
2. **General:**
   - Provider **GitHub**, `medusa-apps`, `main`;
   - **Build Path `/`**, Trigger **On Push**.
3. **Build Type: Dockerfile:**
   - Docker File `pos/storefront/Dockerfile`
   - Docker Context Path `pos/storefront`
4. **Watch Paths:** `pos/storefront/**`.

### B. Build Time Arguments
These are built into the shop's code. Changing one later means **Rebuild**.
```
NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://<api host>
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<pk_… from step 3.C>
NEXT_PUBLIC_BASE_URL=https://<shop host>
NEXT_PUBLIC_DEFAULT_REGION=kh
NEXT_PUBLIC_STRIPE_KEY=
NEXT_PUBLIC_CAPTCHA_PROVIDER=
NEXT_PUBLIC_CAPTCHA_SITE_KEY=
S3_IMAGE_HOSTNAME=
S3_IMAGE_PATHNAME=/**
```
If you set up S3, put the **host part** of `S3_FILE_URL` in `S3_IMAGE_HOSTNAME`. A typo in any of these shows up later only as a 500 on every page (F-016), so check them twice.

### C. Environment Variables (runtime)
```
NODE_ENV=production
PORT=8000
MEDUSA_BACKEND_URL=https://<api host>
REVALIDATE_SECRET=<D>
SHOPPER_IP_SECRET=<E>
CLIENT_IP_HEADER=
```
→ **Save**.

### D. Domain and Swarm settings
1. **Domains** → **Add Domain**: `<shop host>`, Path `/`, **Container Port `8000`**, HTTPS on, Let's Encrypt.
2. **Swarm Settings** → **Health Check**, two boxes:
   - box 1: `CMD-SHELL`
   - box 2: `node -e "fetch('http://localhost:8000/favicon.ico').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`

   Interval `30000000000`, Timeout `10000000000`, Start Period `60000000000`, Retries `3` → **Save Health Check**.
3. **Update Config:** same as the backend (Start First, Rollback).

### E. Deploy and check
1. **Deploy** (about 5 minutes).
2. Open `https://<shop host>/`.

**Check:** it redirects to `/kh` and shows the shop with the demo products.

**Reply with:** `<shop host>`, and "Step 5 done" or what you see instead.

---

## Step 6: Till app `pos-pos-app` (about 10 minutes)

### A. Create the app
1. **Create Service** → **Application** → name `pos-pos-app` → **Create**.
2. **General:**
   - Provider **GitHub**, `medusa-apps`, `main`;
   - **Build Path `/`**, Trigger **On Push**.
3. **Build Type: Dockerfile:**
   - Docker File `pos/pos-app/Dockerfile`
   - Docker Context Path `pos/pos-app`
4. **Watch Paths:** `pos/pos-app/**`.

### B. Environment
1. **Build Time Arguments:** none.
2. **Environment Variables:**
   ```
   NODE_ENV=production
   PORT=3000
   MEDUSA_BACKEND_URL=https://<api host>
   COOKIE_SECRET=<F>
   ```
   - `F` seals the cashier's sign-in cookie. Changing it later signs every till out.
   - The app talks to the backend only from its own server, so the browser never sees the token.
3. **Save**.

### C. Domain and Swarm settings
1. **Domains** → **Add Domain**: `<till host>`, Path `/`, **Container Port `3000`**, HTTPS on, Let's Encrypt.
2. **Swarm Settings** → **Health Check**, two boxes:
   - box 1: `CMD-SHELL`
   - box 2: `node -e "fetch('http://localhost:3000/manifest.webmanifest').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`

   Interval `30000000000`, Timeout `10000000000`, Start Period `60000000000`, Retries `3` → **Save Health Check**. The manifest needs no sign-in and no backend, so it's a safe health check.
3. **Update Config:** same as the backend (Start First, Rollback).

### D. Deploy and check
1. **Deploy** (about 5 minutes).
2. Open `https://<till host>/`.

**Check:**
- it redirects to `/login` and shows **POS counter** / "Sign in to open the till.";
- on the Dokploy server (SSH), this lists the backend, storefront and till app as `(healthy)` and the worker as `Up`:
  ```bash
  docker ps --filter name=pos- --format '{{.Names}} {{.Status}}'
  ```

**Reply with:** `<till host>`, the output of that `docker ps` line, and "Step 6 done".

---

## Step 7: Set up the shop and make a test sale (about 15 minutes)

### A. Stock at the shop
1. Admin `https://<api host>/app` → **Inventory**.
2. Search `SHIRT-L-BLACK` (Medusa T-Shirt, L / Black) and open it.
3. **Locations** section: if **Phnom Penh** isn't listed, add it with **Manage locations**.
4. Set Phnom Penh's **In stock** to **10** → **Save**.
5. **Settings** → **Locations & Shipping** → **Phnom Penh** → **Sales Channels**: **Default Sales Channel** must be listed. `seed.js` links it already.

**Check:** Phnom Penh shows 10 in stock for `SHIRT-L-BLACK`.

### B. Register and cashier (admin API, from your computer)
There is no admin page for these yet, so use `curl` in a terminal on your own computer. Do this **before** you turn on 2FA for this admin; with 2FA, sign-in needs the extra code step.

1. Get an admin token. Replace the email and password; the token stays in your terminal only:
   ```bash
   API=https://<api host>
   TOKEN=$(curl -s -X POST $API/auth/user/emailpass -H 'content-type: application/json' \
     -d '{"email":"<your-email>","password":"<your password>"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
   AUTH="authorization: Bearer $TOKEN"
   echo ${#TOKEN}      # a number above 100 = OK; 0 or a short number = wrong email/password
   ```
2. Find the two IDs you need:
   ```bash
   curl -s -H "$AUTH" "$API/admin/stock-locations?fields=id,name"
   curl -s -H "$AUTH" "$API/admin/sales-channels?fields=id,name"
   ```
   - Note the `sloc_…` ID of **Phnom Penh**.
   - Note the `sc_…` ID of **Default Sales Channel**.
3. Create the register. This also creates the hidden "In store (POS)" shipping option:
   ```bash
   curl -s -X POST $API/admin/pos/registers -H "$AUTH" -H 'content-type: application/json' \
     -d '{"name":"Front till","code":"PP-1","stock_location_id":"<sloc_…>","sales_channel_id":"<sc_…>"}'
   ```
   **Check:** the answer starts with `{"register":` and includes `"name":"Front till"`.
4. Invite a cashier. Use any email you can type at the till; no email is sent:
   ```bash
   curl -s -X POST $API/admin/pos/cashiers -H "$AUTH" -H 'content-type: application/json' \
     -d '{"name":"Test Cashier","email":"<cashier email>"}'
   ```
   **Check:** the answer starts with `{"cashier":`.

A `401` at any point means the token expired: run step 1 again.

### C. A sale at the till
1. Open `https://<till host>/login` → **First time? Set your password**.
2. Enter the cashier email from B.4, and a password of at least 8 characters, twice → **Set password and sign in**.
3. **Choose a register:** *Front till*.
4. **Opening cash:** `20` → **Open shift**.
5. Type or scan `SHIRT-L-BLACK` and press Enter. Make the quantity **2**.
6. **Payment method: Cash.** **Cash received:** e.g. the total rounded up → **Complete sale**.
7. On **Sale complete**, note the **order number**, then press **Print receipt** (printing to PDF is fine).
8. **Close shift.** **Cash counted** = 20 plus the sale's total → close.

   **Check:** **Shift closed** shows variance **0.00**.
9. Admin → **Shift report** in the sidebar (`/app/pos-shifts`).

   **Check:** the *Front till* shift shows expected = counted, variance 0.

**Reply with:**
- the **order number**;
- a screenshot of the Shift report row (or its numbers);
- anything that looked wrong, even small.

---

## Step 8: What I check from here
With your three hosts, the `pk_…` key and the order number, I check:

| Check | Pass |
|---|---|
| `https://<api host>/health` | 200 `OK` |
| `https://<api host>/app/` | 200 |
| `/store/products` with your key, T-shirt L / Black | `inventory_quantity` **8**: 10 minus the 2 sold at the till, so the till took stock from the shop's location only (plan §6.2 acceptance) |
| `https://<shop host>/kh` and a product page | render |
| Shop checkout delivery options | "Phnom Penh Delivery" shown, "In store (POS)" **not** shown |
| `https://<till host>/login` | 200 |
| `https://<till host>/` with no session | redirects to `/login` |
| `https://<till host>/manifest.webmanifest` | 200 |
| CORS | API accepts the shop and till origins, refuses a foreign one |

---

## Step 9: Each app redeployed alone (independence, about 20 minutes)
For each app below:
1. Open the app → click **Deploy** and wait until it's done.
2. Open the **Deployments** tab of the **other three** apps. None may show a new entry.
3. Check that the shop, the till's `/login` and `https://<api host>/health` still answer.

Order:
1. `pos-storefront`
2. `pos-pos-app`
3. `pos-worker`
4. `pos-backend`

**Reply with** one line per app, e.g. "storefront alone: others unchanged, all OK".

The automatic **rollback** (a failing health check rolls back to the old container) was proven once for the whole repo in P0-19. The POS apps use the same Swarm settings, so it isn't repeated here.

After this I tick the last two items of P2-14 in `TASKS.md` and close Phase 2.

---

## Step 10: If something fails
1. Send the deployment's **log lines around the error**: the app → **Deployments** → the failed one → **View**.
2. Don't retry with changed settings first (`DEV_FLOW.md` §6). We find the cause together.

Known causes:

| Symptom | Likely cause | Fix |
|---|---|---|
| Bad Gateway on the API; `Knex: Timeout acquiring a connection` | `DATABASE_URL` and `REDIS_URL` swapped or wrong (F-012) | fix step 2.B, redeploy |
| Every shop page 500 | typo in a storefront **build-time** argument (F-016) | fix step 5.B, **Rebuild** |
| Shop shows no products | wrong publishable key, or the key has two sales channels (F-017) | step 3.C, then 5.B and Rebuild |
| App stuck in "Starting" / never healthy | health check in one box, or `CMD` instead of `CMD-SHELL` (F-021) | redo the two boxes |
| Worker redeploys on every push | its Watch Paths box is empty (F-019) | step 4.A.4 |
| Till: "Not enough stock at Phnom Penh" | step 7.A not done | give Phnom Penh stock |
| Till: "This register has no stock location" | register created without `stock_location_id` | step 7.B.3 |
| `curl` answers `401` | admin token missing or expired | step 7.B.1 again |
| Till sign-in: "Enter the invited email…" | the email isn't invited, or the password is shorter than 8 characters | step 7.B.4, or a longer password |
