# booking-services / storefront

Customer storefront for the booking services business project (BUILD_PLAN §6.3). Standard: `BUILD_PLAN.md` §4.2.

**Copied from `ecommerce/storefront` at `main` `26c3d97`** (TASKS Phase 3, owner 2026-11-04: full copy of Ecommerce, on the latest Medusa; F-044). It talks to `booking-services/backend`, which has the same store routes, so PayWay checkout, the Cambodia address and phone rules, Telegram contact, CAPTCHA, wishlist, account emails and revalidation work the same here. Changes from the copy:
- Package name `booking-services-storefront`; the Dockerfile, `.env.example` and comments name `booking-services/*`.
- `@medusajs/*` packages moved to **2.22.2** with `scripts/update-medusa.sh booking-services 2.22.2`. Since 2026-11-06 on **2.22.3** (`scripts/update-medusa.sh all 2.22.3`, TASKS V-01) and Next.js **16.4.5** (the ecommerce README's Next.js 16 sync applies here too, TASKS V-04).
- `.guard-baseline` is `159252e ecommerce/storefront`: the starter's type suppressions came with the copy, and `scripts/guard.sh` compares against that app at the starter import.

Service pages, the slot picker and booking management come in P3-13. The ecommerce notes below apply unchanged.

**Starter (of the Ecommerce source):** `medusajs/dtc-starter` `apps/storefront` at commit **`f677db4`** (2026-10-09, Medusa 2.21.2; synced from `15ef93d`: the starter removed `generateStaticParams` from the product, collection and category pages, PR medusajs/dtc-starter#73; before that, from `e3a237c9b877`: only the 2.21.2 package bump). `engines.node` is `>=22.22.0`, as the starter root and Medusa 2.22 require. Next.js is **15.5.27**, ahead of the starter's 15.5.24, for the 2026-09-30 security fixes (TASKS F-030). Starter changes applied (plan §4.2):
1. Standalone pnpm package: `packageManager: pnpm@12.6.0`, own lockfile, settings-only `pnpm-workspace.yaml` (starter root `pnpm.overrides`; `unrs-resolver` build declined, as in the starter).
2. Package renamed `@dtc/storefront` → `booking-services-storefront`. A `typecheck` script was added, because the starter sets `typescript.ignoreBuildErrors`.
3. `output: "standalone"` + `outputFileTracingRoot: __dirname` in `next.config.js`.
4. Image host from `S3_IMAGE_HOSTNAME` / `S3_IMAGE_PATHNAME` (was `MEDUSA_CLOUD_S3_*`).
5. ~~`generateStaticParams` guarded~~: no longer needed. Since `f677db4` the starter has no `generateStaticParams`, so `next build` never calls the backend and pages render on request (BUILD_PLAN §4.2 change 5, Revision 7).
6. `src/lib/config.ts`: server-side calls prefer the runtime `MEDUSA_BACKEND_URL` (private URL). Verified: a wrong runtime URL breaks SSR and the correct one serves it. `src/middleware.ts` still uses the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL`.
7. `products/[handle]/page.tsx`: `export const dynamic = "force-dynamic"`. The starter's cookie helpers swallow Next's `DynamicServerError`, so pre-rendered or revalidating product pages returned 500 (`DYNAMIC_SERVER_USAGE`) in the Docker image. Reproduced locally and fixed; upstream report medusajs/nextjs-starter-medusa#439 (TASKS F-015).

## Env
- **Build-time** (Dokploy Build-time Arguments): `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (public), `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (required, or the build aborts), `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DEFAULT_REGION`, `NEXT_PUBLIC_STRIPE_KEY`, `S3_IMAGE_HOSTNAME`, `S3_IMAGE_PATHNAME`.
- **Runtime:** `MEDUSA_BACKEND_URL` (internal Dokploy hostname), `PORT=8000`.

## Deploy (Dokploy)
Steps: `../DOKPLOY_STAGING.md` section 4 (Build Path `/`, Docker File `booking-services/storefront/Dockerfile`, Context `booking-services/storefront`, Watch Paths `booking-services/storefront/**`). Use the publishable key whose sales channel holds the products; Medusa's own first-boot key sees none (TASKS F-017).

## Verify (DEV_FLOW §5)
```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder pnpm build   # must pass with the backend down
pnpm typecheck
podman build --build-arg NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder -t booking-services-storefront:check .
```
The full local stack is in `../docker-compose.local.yml`.
