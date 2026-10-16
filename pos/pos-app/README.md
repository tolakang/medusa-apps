# pos / pos-app

The shop counter app (TASKS P2-10): a Next.js **PWA** for the shop's tablets (decision D5). Cashiers sign in, pick a register, open a shift, scan items, add a customer, take payment (cash, card or QR), print the receipt and close the shift. It runs on top of the POS backend routes (`../backend`, TASKS P2-06).

Plain Next.js 15 + `@medusajs/js-sdk` 2.21.2, as the web client standard asks for portals and the POS app; Tailwind with `@medusajs/ui-preset`.

## How it works

- **Server-side backend access.** The browser only talks to this app. Next.js server code calls Medusa with `@medusajs/js-sdk` (`src/lib/server/medusa.ts`, `jwtTokenStorageMethod: "nostore"`, so the SDK shared by all requests never stores a token).
- **Session.** Sign-in (`POST /auth/cashier/emailpass`) returns the cashier's JWT. The app keeps it in an httpOnly, SameSite=Strict cookie, sealed with AES-256-GCM under `COOKIE_SECRET` (`src/lib/session-seal.ts`). Page scripts never see the token. A 401 from the backend (expired token, deactivated cashier) signs the till out.
- **Proxy.** `/api/pos/*` forwards an allow-list of cashier routes to the backend's `/pos/*` with the token (`src/lib/proxy-path.ts`). POSTs must come from the app's own pages (Origin check).
- **First time.** An admin invites the cashier (Admin → `POST /admin/pos/cashiers`). On the sign-in page, *First time? Set your password* registers the invited email and accepts the invitation (`/auth/cashier/emailpass/register`, then `/pos/cashiers/accept`).
- **Scanning.** USB and Bluetooth scanners type the code and press Enter into the focused field. Tablets whose browser has the `BarcodeDetector` API (Chrome on Android) also get a **Camera** button. The code matches a variant's barcode, EAN, UPC or SKU exactly.
- **Totals.** The cart total is an estimate from the scanned prices. The backend prices the sale again with promotions and tax, and the receipt shows the final total and the cash change from it.
- **Card and QR** are taken on the shop's own terminal or KHQR stand; the sale records the method (TASKS F-038).
- **PWA.** `src/app/manifest.ts`, icons in `public/icons/`, and `public/sw.js`, which caches only static files. Sales and shifts always need the network: a sale can't be taken offline.
- **Receipt.** *Print receipt* uses the browser's print dialog, laid out for 80 mm paper (`globals.css` `@media print`).

## Run locally

```bash
# backend on :9000 (../backend README), then:
cp .env.example .env.local   # MEDUSA_BACKEND_URL=http://localhost:9000, COOKIE_SECRET=<16+ chars>
pnpm install --frozen-lockfile
pnpm dev                     # http://localhost:3000
```

Or the whole project with `../docker-compose.local.yml`.

## Verify

```bash
pnpm build && pnpm typecheck && pnpm test   # unit tests: cart, change, session seal, proxy allow-list
```

## Deploy (Dokploy)

Application `pos-pos-app`, Dockerfile build (`pos/pos-app/Dockerfile`), port 3000. Runtime variables: `MEDUSA_BACKEND_URL` (the backend's internal hostname) and `COOKIE_SECRET` (required). No build arguments are needed. See `../README.md`.
