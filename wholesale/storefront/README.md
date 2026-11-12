# wholesale / storefront

Next.js B2B buyer shop for the wholesale business project. Standard: `BUILD_PLAN.md` §4.2; scope: §6.4 (TASKS P4-08).

**Starter:** `medusajs/b2b-starter` `apps/storefront` at commit **`f352e3c`** (2026-11-09, Medusa 2.22.6, Next.js 16.3.8). Here: Next.js **16.4.5**, `@medusajs/ui` **4.2.13** (the repo's pin rule), pnpm 12.18.0.

## What buyers get

- **Sign-in first.** With `NEXT_PUBLIC_REQUIRE_LOGIN` on (the default), a visitor without a session sees only the sign-in / sign-up page and the legal pages (`terms`, `privacy`, `contact`); every other page sends them to sign-in (`src/middleware.ts`).
- **Company sign-up.** One form creates the customer, the company and the customer as its first admin (backend `POST /store/companies`, TASKS P4-07). A colleague ticks "I have a join code" instead and joins the company that invited them.
- **Inviting colleagues** (company admins, Company page): enter an email, get a **join code**, give it to the colleague. Nobody is added without using the code (REVIEW_FIXES B14). A signed-in customer without a company can also enter a code on their account page.
- **Approved companies only:** the backend shows products and prices only to employees of an approved company; anyone else lands on their account page, which says why (REVIEW_FIXES X4).
- **Company page:** details, approval settings, employees with spending limits (`/store/companies/me…`).
- **Their own prices:** product and home pages render per request, so a buyer in a price tier (customer group) sees that tier's prices.
- **Quick order** (`/account/quick-order`): paste `SKU, quantity` lines or upload a CSV; found SKUs go into the cart in one request, unknown ones are listed.
- **Reorder:** on an order's page, one button puts its items in the cart again at today's prices.
- **Invoices** (`/account/invoices`): number, dates, terms, total, amount due, PDF. A company admin sees the whole company's. The PDF downloads through `/api/invoices/<order id>`, because the buyer's token is in an httpOnly cookie.
- **Paying** (TASKS P4-12): with PayWay set up on the backend, prepaid companies see only "ABA PayWay" and pay on PayWay's page (back at `/checkout/payway-return`); companies on net terms see only "Pay by invoice". Without PayWay, everyone pays by invoice.
- **From the starter, unchanged:** quotes, approvals, bulk add from the product table, cart export to CSV, checkout with "Pay by invoice" (the system payment provider).

## Changes to the starter

Plan §4.2 changes:

1. Standalone pnpm package: own `packageManager`, lockfile and settings-only `pnpm-workspace.yaml` (the starter root's `@types/react` overrides).
2. Renamed `@b2b-starter/storefront` → `wholesale-storefront`; `typecheck` and `test` scripts added.
3. `output: "standalone"` and (8) `outputFileTracingRoot: __dirname` in `next.config.js`.
4. Image host from `S3_IMAGE_HOSTNAME` / `S3_IMAGE_PATHNAME`.
5. The three `generateStaticParams` (products, collections, categories) are removed, so `next build` never calls the backend.
6. `src/lib/config.ts`: server-side calls prefer the runtime `MEDUSA_BACKEND_URL`.
7. Product and home pages: `dynamic = "force-dynamic"`. The starter pre-rendered them (`force-static`, 60 s) with guest prices, which hides a buyer's tier prices.
9. / 10. / 11. Not needed: this starter doesn't cache its backend calls (no `force-cache`), so admin changes and order status show at once, and it has no `/store/locales` call.
12. `error.tsx`, `global-error.tsx`, `poweredByHeader: false`, and `medusa-error.ts` logs status and path only.

Starter problems fixed (TASKS F-066):

- `@radix-ui/react-accordion` is imported but was not declared (the starter gets it by hoisting in its monorepo): added.
- `tailwind.config.js` pointed at `../../node_modules`, outside this app: removed (the build failed on it).
- `geist` is pinned to `1.5.1`, the starter lockfile's version: a fresh install picked 1.9.2, whose CSS fails the build.
- Five type errors fixed, so `pnpm typecheck` is clean; the four `as any` are replaced.
- `addToCartBulk` used a plain `fetch` and never read the response, so a refused item looked added. It now returns the backend's message (minimum order quantity, company not approved, cart waiting for approval), and the buyer sees it.
- The order page put a table row straight into a `div` (hydration error): wrapped in a table.
- A leftover `console.log` in the button component: removed.
- Order and quote dates showed the month one too low (`getMonth()` counts from 0): fixed (TASKS F-084).

Wholesale changes:

- Company calls use the backend's `/store/companies/me…` routes; sign-up no longer adds the employee in a second call (`src/lib/data/companies.ts`, `customer.ts`).
- Removed: the "Invite employees" card (a starter stub that only said "Not implemented"), the "Deploy to Medusa Cloud" banner, and the Vercel Analytics script.
- The starter's catalog and checkout for AI agents (UCP under `/ucp` and `/.well-known/ucp`, `/buy` links, `llms.txt`, product Markdown, `sitemap.xml`) answer 404 while sign-in is required, because they show products and prices to anyone. With `NEXT_PUBLIC_REQUIRE_LOGIN=false` they work as in the starter.

**Sign-in on the backend too (TASKS F-068):** with `WHOLESALE_REQUIRE_LOGIN` on (the backend's default), the Store API's product, variant and search routes need a signed-in customer, so the publishable key alone reads no products or prices. For that:

- **Session check:** the middleware asks the backend whether the session token is still good (remembered for a minute per token). A missing, expired or foreign token goes to sign-in.
- **Search:** the browser searches through this app's `/api/search`, which adds the buyer's token (it is in an httpOnly cookie).
- **Crawlers:** `sitemap.xml` is empty and `robots.txt` disallows everything while sign-in is required.

Keep the two switches the same: `NEXT_PUBLIC_REQUIRE_LOGIN` here and `WHOLESALE_REQUIRE_LOGIN` on the backend.

**Refused orders:** when the backend refuses to place an order (spending limit, credit limit, approval, company status), checkout shows the backend's reason. The starter threw it from a server action, which production builds replace with a generic error.

## Env

- **Build-time** (Dokploy Build-time Arguments): `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (public), `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (required, or the build aborts; use the "Wholesale storefront" key from `pnpm seed:b2b`), `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DEFAULT_REGION`, `NEXT_PUBLIC_REQUIRE_LOGIN`, `NEXT_PUBLIC_STRIPE_KEY` (unused), `S3_IMAGE_HOSTNAME`, `S3_IMAGE_PATHNAME`.
- **Runtime:** `MEDUSA_BACKEND_URL` (internal Dokploy hostname, optional), `PORT=8000`.

The starter's Adyen, PayPal and Medusa Payments code is unused here; their `NEXT_PUBLIC_*` keys are not build args.

## Deploy (Dokploy)

Build Path `/`, Docker File `wholesale/storefront/Dockerfile`, Docker Context Path `wholesale/storefront`, Watch Paths `wholesale/storefront/**`, domain → port 8000. Order and CORS: `../README.md`.

## Verify (DEV_FLOW §5)

```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder pnpm build   # must pass with the backend down
pnpm typecheck
pnpm test                                                      # quick-order line parser
```

Or from the repo root: `CONTAINER_CLI=podman scripts/verify.sh wholesale/storefront --image`. The full local stack is in `../docker-compose.local.yml`.
