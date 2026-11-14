# Runbook: `booking-staging` on Dokploy (TASKS P3-18)

A click-by-click setup of the Booking services business project on a Dokploy **staging** project, written like the POS runbook (`../pos/DOKPLOY_STAGING.md`), which passed on 2026-11-14. You don't need any other runbook. Do the steps **in order**. Each step ends with **Check** (what you should see) and **Reply with** (what to send so I can verify from here). Field names are Dokploy's own, verified on the Ecommerce and POS staging (findings F-011, F-012, F-016, F-017, F-019, F-020, F-021, F-086).

**Never paste secret values** in chat: keys, passwords, connection URLs, tokens.

When you're done you have one Dokploy project, `booking-staging`, with **5 services**:

| Service | What it is | Domain → container port | Step |
|---|---|---|---|
| `booking-postgres` | database `booking_services` | none | 1 |
| `booking-redis` | cache, events, locks | none | 1 |
| `booking-backend` | Medusa server + admin | `<api host>` → 9000 | 2–3 |
| `booking-worker` | Medusa worker (same image): emails, reminders, frees expired holds | none | 4 |
| `booking-storefront` | the booking shop | `<shop host>` → 8000 | 5 |

---

## Step 0: Decide and prepare (about 5 minutes)

### A. Hostnames
1. Pick two hostnames, for example:
   - `<api host>` = `booking-api.<your-domain>`: backend and admin
   - `<shop host>` = `booking.<your-domain>`: the booking shop
2. At your DNS provider, create an **A record** for each one, pointing to the Dokploy server's IP: the same IP as the Ecommerce and POS staging.
3. **No DNS?** Use Dokploy's **Generated** domains instead. They are HTTP only, so write `http://` instead of `https://` everywhere below.

### B. Secrets
On your own computer, run this **five times**:
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

### C. Optional extras (recommended: later)
- S3 images, Resend email, Telegram alerts and ABA PayWay can all be added after the core passes.
- Without them, product images stay on the container's disk (lost on redeploy), and email and Telegram only write to the log. Customers then pay with Medusa's built-in **manual payment**, and every booking check still works.
- **PayWay is worth adding now** if you have the sandbox values from Ecommerce: then Step 6 also tests a real card payment and the refund on cancel. The same merchant ID and keys work here.
- Use a **separate** bucket (e.g. `booking-staging`) and Telegram group from the other shops.

**Reply with:** the two hostnames (or "generated domains"), and "extras now" or "extras later".

---

## Step 1: Project and databases (about 5 minutes)

### A. Project
1. Dokploy → **Projects** → **Create Project**.
2. Name: `booking-staging` → **Create**.

### B. Postgres
1. Open `booking-staging` → **Create Service** → **Database** → **Postgres**.
2. Name: `booking-postgres`.
3. **Database Name:** `booking_services`. Keep the user and password Dokploy suggests.
4. **Create**, then **Deploy**.
5. **General** tab → copy the **Internal Connection URL** (it starts with `postgresql://`) into your password manager as **DB URL**.
6. Leave **External Credentials** **off**. Turning it on opens port 5432 to the internet.

### C. Redis
1. **Create Service** → **Database** → **Redis**.
2. Name: `booking-redis` → **Create** → **Deploy**.
3. **General** tab → copy the **Internal Connection URL** (it starts with `redis://`) into your password manager as **REDIS URL**.

**Check:** both services show as running (green).

**Reply with:** "Step 1 done".

---

## Step 2: Backend server `booking-backend` (about 20 minutes, mostly build time)

### A. Create the app and connect the code
1. In `booking-staging`: **Create Service** → **Application** → name `booking-backend` → **Create**.
2. **General** tab → **Provider: GitHub**:
   - Repository: `medusa-apps`
   - Branch: `main`
   - **Build Path:** `/` (just a slash)
   - Trigger Type: **On Push**
   - **Save**
3. **Build Type: Dockerfile**:
   - **Docker File:** `booking-services/backend/Dockerfile`
   - **Docker Context Path:** `booking-services/backend`
   - Docker Build Stage: leave empty
   - **Save**
4. **Watch Paths:** `booking-services/backend/**` (with `/**` at the end) → **Save**.

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
   AUTH_CORS=https://<api host>,https://<shop host>
   MEDUSA_BACKEND_URL=
   DISABLE_MEDUSA_ADMIN=false
   MEDUSA_WORKER_MODE=server
   RUN_MIGRATIONS=true
   STOREFRONT_URL=https://<shop host>
   REVALIDATE_SECRET=<D>
   SHOPPER_IP_SECRET=<E>
   CLIENT_IP_HEADER=
   BOOKING_HOLD_MINUTES=15
   BOOKING_DEFAULT_TIMEZONE=Asia/Phnom_Penh
   BOOKING_CANCEL_HOURS=24
   ```
   The last three: a time is held 15 minutes while the customer pays, schedules are in Phnom Penh time, and a booking cancelled at least 24 hours before its start is refunded.
2. **Check two lines before saving:**
   - `DATABASE_URL` starts with `postgres`;
   - `REDIS_URL` starts with `redis`.

   Swapping them was the main mistake on the Ecommerce staging (F-012).
3. Generated domains: use `http://` in the five URLs.
4. Leave **Build Time Arguments** empty → **Save**.

**Optional extras** (only if you said "extras now"). Add these lines below the block, with the meaning of each in `booking-services/backend/.env.example`. With PayWay, also do step 3.D:
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
# Bot token and chat ID: see "Telegram bot and chat ID, step by step" (alerts section)
TELEGRAM_BOT_TOKEN=<staff bot token>
TELEGRAM_CHAT_ID=<staff group id, negative>
# ABA PayWay sandbox (empty API URL = sandbox)
PAYWAY_MERCHANT_ID=<merchant id>
PAYWAY_API_KEY=<the "Public Key" from ABA's email>
PAYWAY_API_URL=
PAYWAY_RETURN_URL=https://<api host>/hooks/payment/payway_payway
# ABA's RSA public key for automatic refunds (one line, "\n" for new lines)
PAYWAY_RSA_PUBLIC_KEY=<the RSA public key from ABA>
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
   docker service inspect $(docker service ls --format '{{.Name}}' | grep booking-backend) --format '{{json .Spec.UpdateConfig}}'
   ```
   It must include `"FailureAction":"rollback"` and `"Order":"start-first"`. If they're missing, pick both dropdowns again, press **Save Update Config** (not **Clear**), and redeploy. The same check works for every app; use its name instead of `booking-backend`.
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
1. `booking-backend` → **Terminal** tab. It opens a shell in the running container.
2. Run this, with your own email and a strong password:
   ```bash
   docker-entrypoint.sh medusa user -e <your-email> -p '<a strong password>'
   ```
3. **Check:** it prints that the user was created.

### B. Staging data
In the same terminal, run the three seeds, **one after the other**:
```bash
docker-entrypoint.sh medusa exec ./src/scripts/seed-initial-data.js
docker-entrypoint.sh medusa exec ./src/scripts/seed.js
docker-entrypoint.sh medusa exec ./src/scripts/seed-booking-demo.js
```
- The first adds the demo products and the European Warehouse.
- The second adds the Cambodia region (USD), the **Phnom Penh** stock location and "Phnom Penh Delivery".
- The third adds the service **Haircut** (30 min $8, 60 min $15) and the stylist **Sophea**, who works Monday to Saturday, 09:00–12:00 and 13:00–17:00 Phnom Penh time.

**Check:** all three finish without an error. The last one ends with `Booking demo: service "Haircut" and stylist Sophea (Asia/Phnom_Penh) created.`

**Check the store currency:** Admin → **Settings** → **Store**. **Default currency** must be **USD** and **Default region** **Cambodia**. If not, click **Edit** and set them. The Haircut has a USD price only, so with EUR the shop can't price it (TASKS F-086).

### C. Publishable key (for the online shop)
1. Open `https://<api host>/app` and log in with the admin from 3.A.
2. **Settings** → **Publishable API Keys**. There is one key.
3. Open it. Under **Sales Channels** it must list exactly **one** channel, **Default Sales Channel**. A key with two channels makes the shop's stock counts fail with a 400 (MEDUSA_SKILL §6).
4. Copy its token (`pk_…`). This one is not secret: it is built into the shop's public code.

### D. PayWay in the Cambodia region (only with PayWay)
Admin → **Settings** → **Regions** → **Cambodia** → **Payment providers**: add **payway** (`pp_payway_payway`) → **Save**. Without this the checkout shows no ABA PayWay option.

**Check:** you can log in to the admin; **Products** shows **Haircut** and the demo products; the sidebar shows **Bookings**.

**Reply with:**
- "Step 3 done";
- the `pk_…` token. With it I check from here that the key sees the products.

---

## Step 4: Worker `booking-worker` (about 10 minutes)

### A. Create the app
1. **Create Service** → **Application** → name `booking-worker` → **Create**.
2. **General:**
   - Provider **GitHub**, Repository `medusa-apps`, Branch `main`;
   - **Build Path `/`**, Trigger **On Push**.
3. **Build Type: Dockerfile:**
   - Docker File `booking-services/backend/Dockerfile`
   - Docker Context Path `booking-services/backend`
4. **Watch Paths:** `booking-services/backend/**`. Never leave this box empty: an empty box redeploys the worker on every push (F-019).

### B. Environment
1. Copy **all** of `booking-backend`'s Environment Variables, including the three `BOOKING_*` lines and any optional extras. The worker sends the emails, Telegram alerts and booking reminders, and frees times whose hold ran out.
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
1. **Deploy**, only after `booking-backend` is healthy (the worker relies on its migrations).
2. **Logs** must show, with no errors:
   - `[entrypoint] Starting Medusa (worker mode: worker)`
   - Redis connected for `event-bus-redis`, `locking-redis` and `workflow-engine-redis`
   - `Server is ready on port: 9000`

**Reply with:** "Step 4 done", or the log lines around the first error.

---

## Step 5: Online shop `booking-storefront` (about 15 minutes)

### A. Create the app
1. **Create Service** → **Application** → name `booking-storefront` → **Create**.
2. **General:**
   - Provider **GitHub**, `medusa-apps`, `main`;
   - **Build Path `/`**, Trigger **On Push**.
3. **Build Type: Dockerfile:**
   - Docker File `booking-services/storefront/Dockerfile`
   - Docker Context Path `booking-services/storefront`
4. **Watch Paths:** `booking-services/storefront/**`.

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

**Check:** it redirects to `/kh` and shows the shop; the store lists **Haircut**.

**Reply with:** `<shop host>`, and "Step 5 done" or what you see instead.

---

---

## Step 6: Book a time, pay, cancel (about 15 minutes)

### A. A customer account
A booking belongs to the customer who is signed in when they book, so sign up **first**. A guest can book, but can't cancel online.
1. Open `https://<shop host>/kh` → **Account** → join with an email you can read.
2. Confirm the email:
   - **with Resend:** open the link in the email;
   - **without Resend:** `booking-worker` → **Logs** → search `verify-account` → open the `https://<shop host>/…/verify-account?…` link from that line.
3. Sign in.

### B. A booking in the shop
1. Still signed in: **Store** → **Haircut**.
2. Pick **Length** `30 min`, a **Day** at least two days ahead (Monday to Saturday), and a **Time** → book. The page says the time is held for you while you check out.
3. Go to the cart → **Checkout**. A service needs no address or delivery: check **First name**, **Last name** and **Email**.
4. Pay:
   - **with PayWay:** choose **ABA PayWay** and use the sandbox **Mastercard 5156 8399 3770 6777**, exp **01/30**, CVV **993** (no 3D Secure);
   - **without PayWay:** choose the manual payment.
5. Note the **order number** on the confirmation page.

**Check:**
- Admin → **Bookings** → resource **Sophea** → that day: the booking shows at that time.
- Back in the shop, the same day no longer offers that time.

### C. Walk-in from the admin
1. Admin → **Bookings** → **Sophea** → **Walk-in booking**: another time that day, **Minutes** `30` → book.

**Check:** "Walk-in booked." and the calendar shows both bookings.

### D. Customer cancels
1. In the shop: **Account** → **Bookings**.
2. The booking from B is under **Upcoming** → **Cancel**.

**Check:**
- It moves to **Past and cancelled**, and the time is free again in the shop.
- **With PayWay:** the start is more than 24 hours away, so the order shows a **refund** in the admin (and later in the PayWay portal).

**Reply with:**
- the order number;
- "booked, walk-in, cancelled" or what went wrong at which step;
- with PayWay: whether the admin shows the refund.

---

## Step 7: What I check from here
With your two hosts, the `pk_…` key and the order number, I check:

| Check | Pass |
|---|---|
| `https://<api host>/health` | 200 `OK` |
| `https://<api host>/app/` | 200 |
| `/store/products` with your key | **Haircut** with two variants, `HAIRCUT-30` and `HAIRCUT-60` |
| `/store/booking/slots` for Haircut, the day of Step 6 | free times inside 09:00–12:00 and 13:00–17:00; the walk-in's time is taken, the cancelled time free again |
| `https://<shop host>/kh` and `/kh/products/haircut` | render |
| CORS | API accepts the shop origin, refuses a foreign one |

---

## Step 8: Each app redeployed alone (independence, about 15 minutes)
For each app below:
1. Open the app → click **Deploy** and wait until it's done.
2. Open the **Deployments** tab of the **other two** apps. None may show a new entry.
3. Check that the shop and `https://<api host>/health` still answer.

Order:
1. `booking-storefront`
2. `booking-worker`
3. `booking-backend`

**Reply with** one line per app, e.g. "storefront alone: others unchanged, all OK".

The automatic **rollback** was proven once for the whole repo in P0-19. These apps use the same Swarm settings, so it isn't repeated here.

**Alerts (pre-deploy audit E-A3).** Dokploy can message you when something goes wrong, so you hear about it before a customer does. Checked against Dokploy **v0.31.0** source (`handle-notifications.tsx`).

1. Dokploy → **Settings → Notifications** → add a **Telegram** notification. Use the staff group: bot token and chat ID as in `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`, or a separate alerts bot. How to create the bot and find the chat ID: *Telegram bot and chat ID, step by step* below. (Slack, Discord, email, Gotify, ntfy and Lark also work.)
2. Turn on **App Build Error**, **App Deploy**, **Database Backup**, **Dokploy Restart** (and **Volume Backup** if you use volume backups).
3. **Check:** the next deploy posts a message to the group, and so does the next database backup (02:00 Cambodia).
4. **App down:** Dokploy has no "app is down" notification. A health check that fails during a deploy rolls back (`FailureAction: rollback`), but a container that dies later only restarts. For an alert, an outside uptime check must call `https://<api host>/health` and the shop every 1–5 minutes. That is a new service: the owner decides and it is recorded in `docs/TASKS.md` (pre-deploy audit E-A3).

**Already on** for the Ecommerce and POS staging (2026-11-14)? Dokploy's notifications cover every project on the server, so there's nothing to add. Otherwise:

**Reply with** "alerts on" and which events you turned on.

#### Telegram bot and chat ID, step by step
You need two values: a **bot token** (the bot's password) and the **chat ID** of the group the bot writes to. The same pair goes into the backend's `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` and into Dokploy's alert. Skip A and B if the staff bot and group already exist.

**A. Create the bot (about 2 minutes)**
1. In Telegram, search **@BotFather** (blue tick) → **Start**.
2. Send `/newbot`.
3. Name: anything, e.g. `My Shop Staff`.
4. Username: must end in `bot` and be free, e.g. `myshop_staff_bot`.
5. BotFather answers with a **token** like `123456789:AAH…`. That's `TELEGRAM_BOT_TOKEN`. Keep it secret: never paste it in a chat or a screenshot. If it leaks, send BotFather `/revoke`, pick the bot, and update the backend env and the Dokploy alert with the new token.

**B. Create the staff group and add the bot**
1. Telegram → **New Group** → add yourself and the staff → name it, e.g. `My Shop Staff`.
2. Group → **Add members** → search the bot's username → add it.

**C. Find the chat ID**
1. In the group, send `/start@<bot username>`, e.g. `/start@myshop_staff_bot`. By default a bot in a group only sees commands, so a plain "hello" isn't enough.
2. On your computer, open this address in a browser, with your token in place of `<token>`:
   `https://api.telegram.org/bot<token>/getUpdates`
3. Look for `"chat":{"id":-…` with your group's `"title"`. That number, **minus sign included**, is `TELEGRAM_CHAT_ID`. Normal groups look like `-4123456789`; bigger groups (supergroups) like `-1001234567890`.
4. If you see `"result":[]`, send the `/start@…` message again and reload the page.
5. If you see `409` / `Conflict`, the bot has a webhook. Use the staff bot here, never the customer bot (`TELEGRAM_CUSTOMER_BOT_TOKEN`), which uses one.
6. If you see `"migrate_to_chat_id"`, the group became a supergroup: use that new number instead.
7. Close the browser tab: the address contains your token.

**D. Add the alert in Dokploy**
1. Dokploy → **Settings → Notifications** → **Add Notification** → choose **Telegram**.
2. **Name**: e.g. `Staff alerts`. **Bot Token**: the token from A. **Chat ID**: the number from C. **Message Thread ID**: leave empty (only for groups with Topics).
3. Click **Test Notification**. A test message must appear in the group. Then click **Create**.
After this I tick P3-18 in `docs/TASKS.md` and close Phase 3.

---

## Step 9: If something fails
1. Send the deployment's **log lines around the error**: the app → **Deployments** → the failed one → **View**.
2. Don't retry with changed settings first (`docs/DEV_FLOW.md` §6). We find the cause together.

Known causes:

| Symptom | Likely cause | Fix |
|---|---|---|
| Bad Gateway on the API; `Knex: Timeout acquiring a connection` | `DATABASE_URL` and `REDIS_URL` swapped or wrong (F-012) | fix step 2.B, redeploy |
| Every shop page 500 | typo in a storefront **build-time** argument (F-016) | fix step 5.B, **Rebuild** |
| Shop shows no products | wrong publishable key, or the key has two sales channels (F-017) | step 3.C, then 5.B and Rebuild |
| App stuck in "Starting" / never healthy | health check in one box, or `CMD` instead of `CMD-SHELL` (F-021) | redo the two boxes |
| Worker redeploys on every push | its Watch Paths box is empty (F-019) | step 4.A.4 |
| Haircut has no price, or prices in € | store default currency or region not USD / Cambodia (F-086) | step 3.B check |
| "No free times on this day" every day | the day is a Sunday or in the past, or `seed-booking-demo` didn't run | another day, or step 3.B |
| Checkout shows no ABA PayWay | PayWay not added to the Cambodia region | step 3.D |
| A held time stays taken after the customer left | the worker isn't running (it frees expired holds) | step 4 |
