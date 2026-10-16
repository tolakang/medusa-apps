# pos / storefront

Online shop for the POS business project: customers buy online from the **same stock** the tills sell (BUILD_PLAN §6.2, TASKS P2-09). Standard: `BUILD_PLAN.md` §4.2.

**Copied from `ecommerce/storefront` at `main` `5efa245`** (TASKS P2-09; same approach as `pos/backend`, owner 2026-10-15: POS reuses all of Ecommerce). It talks to `pos/backend`, which has the same store routes, so PayWay checkout, the Cambodia address and phone rules, Telegram contact, CAPTCHA, wishlist, account emails and revalidation work the same here. Changes from the copy:
- Package name `pos-storefront`. The Dockerfile and `.env.example` name `pos/storefront`, and the default region is `kh`.
- Comments that pointed at `ecommerce/backend` now point at `pos/backend`.
- `.guard-baseline` is `159252e ecommerce/storefront`: the starter's three type suppressions came with the copy, and `scripts/guard.sh` compares against that app at the starter import.

The ecommerce notes below apply unchanged. **Starter:** `medusajs/dtc-starter` `apps/storefront` at commit **`f677db4`** (2026-10-09, Medusa 2.21.2; synced from `15ef93d`: the starter removed `generateStaticParams` from the product, collection and category pages, PR medusajs/dtc-starter#73; before that, from `e3a237c9b877`: only the 2.21.2 package bump). `engines.node` is `>=22.22.0`, as the starter root and Medusa 2.22 require. Next.js is **15.5.27**, ahead of the starter's 15.5.24, for the 2026-09-30 security fixes (TASKS F-030). Starter changes applied (plan §4.2):
1. Standalone pnpm package: `packageManager: pnpm@12.6.0`, own lockfile, settings-only `pnpm-workspace.yaml` (starter root `pnpm.overrides`; `unrs-resolver` build declined, as in the starter).
2. Package renamed `@dtc/storefront` → `pos-storefront`. A `typecheck` script was added, because the starter sets `typescript.ignoreBuildErrors`.
3. `output: "standalone"` + `outputFileTracingRoot: __dirname` in `next.config.js`.
4. Image host from `S3_IMAGE_HOSTNAME` / `S3_IMAGE_PATHNAME` (was `MEDUSA_CLOUD_S3_*`).
5. ~~`generateStaticParams` guarded~~: no longer needed. Since `f677db4` the starter has no `generateStaticParams`, so `next build` never calls the backend and pages render on request (BUILD_PLAN §4.2 change 5, Revision 7).
6. `src/lib/config.ts`: server-side calls prefer the runtime `MEDUSA_BACKEND_URL` (private URL). `src/middleware.ts` still uses the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL`.
7. `products/[handle]/page.tsx`: `export const dynamic = "force-dynamic"` (starter cookie helpers swallow Next's `DynamicServerError`; TASKS F-015).

## Same stock as the tills
- Build with the publishable key of the **online** sales channel. The product page shows `+variants.inventory_quantity`, which Medusa counts over the stock locations of that key's sales channel.
- Link the shop's stock location (each register's location) to the online channel too (Admin → Settings → Locations & Shipping → the shop → Sales Channels). Then a till sale lowers what the online shop shows, and an online order reserves stock the till can no longer sell (`pos/backend/integration-tests/http/pos-shared-stock.spec.ts`).
- Stock that only the online shop should sell (e.g. a warehouse) stays in a location that no register uses. Tills only ever take stock from their own location (P2-11).
- The hidden "In store (POS)" shipping option never appears in this shop's checkout (P2-11).

## Env
- **Build-time** (Dokploy Build-time Arguments): `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (public), `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (online channel; required, or the build aborts), `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DEFAULT_REGION`, `NEXT_PUBLIC_STRIPE_KEY`, `NEXT_PUBLIC_CAPTCHA_PROVIDER`, `NEXT_PUBLIC_CAPTCHA_SITE_KEY`, `S3_IMAGE_HOSTNAME`, `S3_IMAGE_PATHNAME`.
- **Runtime:** `MEDUSA_BACKEND_URL` (internal Dokploy hostname), `PORT=8000`, `REVALIDATE_SECRET`, `SHOPPER_IP_SECRET`, `CLIENT_IP_HEADER`. Details in `.env.example`.

## Deploy (Dokploy)
Service `pos-storefront` in the `pos` project (`../README.md`): Build Path `/`, Docker File `pos/storefront/Dockerfile`, Context `pos/storefront`, Watch Paths `pos/storefront/**`, domain port 8000. The steps are the same as `../../ecommerce/DOKPLOY_STAGING.md` section 4. Set the backend's `STORE_CORS` and `AUTH_CORS` to this domain, and its `STOREFRONT_URL` and `REVALIDATE_SECRET` to match.

## Verify (DEV_FLOW §5)
```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder pnpm build   # must pass with the backend down
pnpm typecheck
podman build --build-arg NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder -t pos-storefront:check .
```
The full local stack is in `../docker-compose.local.yml`.
