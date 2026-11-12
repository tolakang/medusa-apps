# marketplace / vendor-portal

Vendor portal for the marketplace business project (BUILD_PLAN §6.6, TASKS P6-09): vendors open a shop, add products, fulfil their orders and follow their payouts. A plain Next.js app (plan §4.2), copied from Reseller's seller portal (`reseller/seller-portal`) and changed for vendors.

- **Sign-in and sign-up** (`/login`): a new vendor opens a shop here (register at `/auth/vendor/emailpass/register`, then `POST /vendors`, P6-03). The shop waits for the marketplace's approval; until then the pages show a notice and no data.
- **Overview** (`/`): orders to fulfil and what's earned but not paid out yet.
- **Products** (`/products`): the vendor's products with their status and **quantity in stock** (editable), and a form to add one (name, description, one price, SKU, "Track stock" and quantity; "send for review" or "keep as a draft"). The marketplace publishes it (P6-04, P6-07). Stock sits at the vendor's own location (P6-15, F-080); untick "Track stock" for made-to-order products.
- **Orders** (`/orders`): the vendor's own orders (its child order of each checkout, P6-05) with items, delivery address, its payout per order, and **Mark fulfilled** (`POST /vendors/me/orders/:id/fulfillments`, which takes the reserved stock; P6-10).
- **Payouts** (`/payouts`): monthly payouts and what's not paid out yet (`/vendors/me/payouts`, P6-06).

**Email confirmation (review 2, A3):** a vendor confirms their sign-in email before they can sign in, and the marketplace can approve a shop only after that. Sign-up and sign-in ask the backend to email the link (`metadata: { actor: "vendor" }`, so it opens this portal's `/verify-account`, which needs no session). The backend builds the link from `VENDOR_PORTAL_URL` (or the first `VENDOR_CORS` origin).

**Per-IP limits:** set `SHOPPER_IP_SECRET` to the backend's value, so the backend counts sign-in and sign-up attempts per vendor's own IP.

**Security:** the backend token is sealed in an httpOnly cookie (`vendor_session`, AES-256-GCM under `COOKIE_SECRET`, 8 hours); pages and server actions call the backend from this app's server only, so the browser never holds the token and the backend needs no CORS entry for this app. A refused token (401) signs the vendor out; a backend outage shows the error page.

## Env

`.env.example`: runtime `MEDUSA_BACKEND_URL` (internal Dokploy hostname), `COOKIE_SECRET` (required, 16+ characters), `SHOPPER_IP_SECRET`, `CLIENT_IP_HEADER`, `PORT=3000`.

## Deploy (Dokploy)

Build Path `/`, Docker File `marketplace/vendor-portal/Dockerfile`, Docker Context Path `marketplace/vendor-portal`, Watch Paths `marketplace/vendor-portal/**`, domain → port 3000. Order: `../README.md`.

## Verify

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test        # format helpers and the sealed session cookie
podman build -t marketplace-vendor-portal:check .
```

Or from the repo root: `CONTAINER_CLI=podman scripts/verify.sh marketplace/vendor-portal --image`. The local stack has it as `vendor-portal` in `../docker-compose.local.yml`.
