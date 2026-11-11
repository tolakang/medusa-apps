# reseller / seller-portal

Seller portal for the reseller business project (BUILD_PLAN §6.5, TASKS P5-08): sellers choose which of your products appear in their shop and follow their sales and commissions. Plain Next.js app (web client standard, plan §4.2), built like `pos/pos-app` (same pins, Dockerfile pattern, sealed session cookie).

- **Sign-in** (`/login`): invite-only, as the backend's seller flow (P5-03). The shop invites the email (`POST /admin/sellers`) and gets an **invite code** to give the seller; the first time, the seller sets a password here with that code (register + `POST /sellers/accept`), then signs in. The invited email alone can't take the account. A suspended seller is signed out on the next page.
- **Overview** (`/`): commission totals (waiting, due, paid), the shop's domain and rate, the latest sales.
- **Products** (`/products`): tick your published products to show in the seller's shop (`/sellers/me/products`).
- **Sales** (`/sales`): orders in the seller's channel with the commission on each (`/sellers/me/orders`); no customer details.
- **Commissions** (`/commissions`): per order, filtered by status (`/sellers/me/commissions`).

**Per-IP limits:** set `SHOPPER_IP_SECRET` to the backend's value, so the backend counts sign-in attempts per seller's own IP. Without it every seller shares this server's limit, and one person's wrong passwords can lock all sellers out (`CLIENT_IP_HEADER` as in the storefront).

**Security:** the backend token is sealed in an httpOnly cookie (`seller_session`, AES-256-GCM under `COOKIE_SECRET`, 8 hours); pages and server actions call the backend from this server only (`src/lib/server`), so the browser never sees the token and the backend needs no CORS entry for the portal. `X-Frame-Options: DENY`, `robots.txt` disallows indexing.

## Run locally
```bash
pnpm install --frozen-lockfile
MEDUSA_BACKEND_URL=http://localhost:9000 COOKIE_SECRET=$(openssl rand -hex 16) pnpm dev   # http://localhost:3000
```

## Verify
```bash
pnpm build && pnpm typecheck && pnpm test
podman build -t reseller-seller-portal:check .
```

## Deploy
See `../README.md` (Dokploy). Env: `.env.example`.
