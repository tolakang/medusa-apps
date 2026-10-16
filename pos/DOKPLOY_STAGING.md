# Runbook: `pos-staging` on Dokploy (TASKS P2-14)

The POS project is built like Ecommerce: `pos/backend` copies `ecommerce/backend` and `pos/storefront` copies `ecommerce/storefront`. So this runbook only lists **what differs**. For every field, health check and pitfall, follow `../ecommerce/DOKPLOY_STAGING.md` with `ecommerce` → `pos` in every name and path. That includes the Swarm health checks and Update Config (F-021, F-020), the Watch Paths glob (F-019), and the "check before saving" notes (F-012, F-016, F-017).

**You need:** the same Dokploy server and GitHub provider, and three hostnames, e.g. `api.pos-staging.<your-domain>`, `shop.pos-staging.<your-domain>` and `pos.pos-staging.<your-domain>`, or Dokploy's **Generated** domains. Below they are `<api host>`, `<shop host>` and `<till host>`.

**Generate** (on your own machine, never commit): `JWT_SECRET`, `COOKIE_SECRET`, `AUTH_MFA_ENCRYPTION_KEY` as in the Ecommerce runbook, plus one more `openssl rand -hex 32` for the till app's `COOKIE_SECRET`. That must be a **different** value from the backend's.

---

## 1. Project and databases
**Create Project** `pos-staging`. Then Postgres `pos-postgres` (database name `pos`) and Redis `pos-redis`, as in Ecommerce §1. POS never shares a database with Ecommerce (`README.md` → *Independence rules*).

## 2. Backend server: `pos-backend`
As in Ecommerce §2: **Docker File** `pos/backend/Dockerfile`, **Docker Context Path** `pos/backend`, **Watch Paths** `pos/backend/**`. The environment is the Ecommerce block, with these changes:
```
STORE_CORS=https://<shop host>
ADMIN_CORS=https://<api host>
AUTH_CORS=https://<api host>,https://<shop host>,https://<till host>
POS_CORS=https://<till host>
STOREFRONT_URL=https://<shop host>
```
- `POS_CORS` is only needed for a client that calls `/pos/*` from the browser. The till app calls from its own server, but set it to the till host anyway so the value is never a localhost default.
- The Phase 1 groups (S3, Resend, Telegram, PayWay, CAPTCHA, revalidation) work the same. Use a **separate** bucket, Telegram staff group and PayWay return URL (`https://<api host>/hooks/payment/payway_payway`) for POS.
- Then run the same health check, domain (port 9000), first admin user and seeds as in Ecommerce §2.6–2.10. Run both `seed-initial-data.js` and `seed.js`: the tests use exactly that data.

## 3. Worker: `pos-worker`
As in Ecommerce §3, with `pos/backend` paths and **Watch Paths `pos/backend/**`**. Use the backend's variables plus the three worker overrides.

## 4. Storefront (online shop): `pos-storefront`
As in Ecommerce §4: **Docker File** `pos/storefront/Dockerfile`, **Context** `pos/storefront`, **Watch Paths** `pos/storefront/**`, port 8000, the same `/favicon.ico` health check.
- **Build Time Arguments:** `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` = the key of the **online** sales channel. That key must be linked to exactly **one** sales channel, or the shop's stock counts fail with a 400 (`storefront/README.md`, MEDUSA_SKILL §6).
- **Runtime:** `REVALIDATE_SECRET` and `SHOPPER_IP_SECRET` as on the backend.

## 5. Till app: `pos-pos-app`
1. **Create Service → Application** `pos-pos-app`. GitHub, `main`, **Build Path `/`**, **Docker File** `pos/pos-app/Dockerfile`, **Docker Context Path** `pos/pos-app`, **Watch Paths** `pos/pos-app/**`.
2. **Build Time Arguments:** none needed. The build calls no backend.
3. **Environment Variables** (runtime):
   ```
   NODE_ENV=production
   PORT=3000
   MEDUSA_BACKEND_URL=https://<api host>
   COOKIE_SECRET=<the till app's own generated value>
   ```
   The public API URL is fine for staging. The backend's internal hostname also works, but only once you have confirmed the exact service name.
4. **Domains:** `<till host>`, path `/`, **container port 3000**, HTTPS.
5. **Swarm Settings → Health Check:** two boxes, `CMD-SHELL` and
   `node -e "fetch('http://localhost:3000/manifest.webmanifest').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`.
   The manifest skips the sign-in redirect and needs no backend. Interval `30000000000`, Timeout `10000000000`, Start Period `60000000000`, Retries `3`. **Update Config** as for the storefront (`start-first`, `rollback`).
6. **Deploy.** `https://<till host>/` redirects to `/login`.

## 6. POS setup in the admin and the till
Do these in order (API details: `README.md` → *Cashiers*, *Shop setup and selling*, *Stock*).
1. **Shop stock:**
   - Admin → Inventory → T-shirt L / Black → give the **Phnom Penh** location 10 in stock.
   - Admin → Settings → Locations & Shipping → Phnom Penh → Sales Channels: make sure the online channel is there. `seed.js` links it already.
2. **Register:** `POST /admin/pos/registers` `{ "name": "Front till", "code": "PP-1", "stock_location_id": <Phnom Penh id>, "sales_channel_id": <online channel id> }`, with an admin token. This also creates the hidden "In store (POS)" shipping option.
3. **Cashier:** `POST /admin/pos/cashiers` `{ "name": "<name>", "email": "<email>" }`. Then on `https://<till host>/login` → *First time here?* → set the password.
4. **A sale at the till:** sign in, pick *Front till*, open the shift with e.g. 20 cash, scan or type `SHIRT-L-BLACK`, sell 2 for cash, print the receipt, close the shift with the right cash count.

## 7. P2-14 checks: send me these, and I verify from here
Send the **three hosts** and the **order number** of the till sale. Never send keys. From here I will check:
- `GET /health` 200 and `/app/` 200 on the API.
- With your online key, `/store/products` lists the T-shirt, and L / Black shows **8**: 10 minus the 2 sold at the till. That is the plan's acceptance on staging: the till took stock from the shop's location only.
- The shop host serves `/kh` and a product page, and doesn't list "In store (POS)" at checkout.
- `https://<till host>/login` 200; `/` redirects to `/login` without a session; `/manifest.webmanifest` 200.
- CORS: the API accepts the shop and till origins and refuses a foreign one.

Also send a screenshot or the numbers of the admin's **Shift report** (`/app/pos-shifts`): the closed shift with variance 0.

## 8. Independence (each app redeployed alone)
Same as Ecommerce §6 step 1, for all **four** apps:
1. **Deploy** `pos-storefront` alone. `pos-backend`, `pos-worker` and `pos-pos-app` must show **no new deployment**.
2. Repeat with `pos-pos-app`, then `pos-worker`, then `pos-backend`. After each one, the shop, the till login and `/health` keep answering.
3. Tell me the result of each. The rollback test (Ecommerce §6 step 3) was proven once for the whole repo in P0-19, so it isn't repeated per phase.

**If anything fails:** send the deployment's log lines around the error. Don't retry with changed settings first (`DEV_FLOW.md` §6).
