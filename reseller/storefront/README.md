# reseller / storefront

Customer storefront for the reseller business project (BUILD_PLAN §6.5). Standard: `BUILD_PLAN.md` §4.2.

**Copied from `ecommerce/storefront` at `main` `847465d`** (TASKS Phase 5, owner 2026-11-10: full copy of Ecommerce; F-061), tracked files only. It talks to `reseller/backend`, which has the same store routes, so PayWay checkout, the Cambodia address and phone rules, Telegram contact and CAPTCHA work as in Ecommerce.
- Package name `reseller-storefront`; the Dockerfile, `.env.example` and comments name `reseller/*`.
- `.env.example` gains `SELLER_RESOLVE_MODE` and `DEFAULT_SELLER_HANDLE` (plan §6.5, read from P5-07 on).
- `.guard-baseline` is `159252e ecommerce/storefront`: the starter's type suppressions came with the copy, and `scripts/guard.sh` compares against that app at the starter import.

**P5-07, multi-tenant:** one deployment serves every seller's domain. `src/lib/data/seller.ts` maps the request's `Host` (or the `path` cookie from `/api/seller/<handle>`) to the seller's publishable key through the backend's `GET /store/sellers/resolve` (cached 300 s); `src/lib/config.ts` sends it with every request (server side from the host, browser side from the `<meta>` the root layout writes). No seller → your own channel (`NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`). Browser search on a seller's domain needs that origin in the backend's `STORE_CORS`. The ecommerce notes below apply unchanged.

---

## From `ecommerce/storefront`

Next.js customer storefront for the ecommerce business project. Standard: `BUILD_PLAN.md` §4.2.

**Starter:** `medusajs/dtc-starter` `apps/storefront` at commit **`f677db4`** (2026-10-09, Medusa 2.21.2; synced from `15ef93d`: the starter removed `generateStaticParams` from the product, collection and category pages, PR medusajs/dtc-starter#73; before that, from `e3a237c9b877`: only the 2.21.2 package bump). `engines.node` is `>=22.22.0`, as the starter root and Medusa 2.22 require. `engines.node` is `>=22.23.4` since Medusa 2.22.3 (TASKS V-01). **Next.js 16 sync (2026-11-06, TASKS V-04):** the starter's `6b95717` "migrate storefront to Next.js 16" is applied: `next` / `eslint-config-next` **16.4.5** (the starter is on 16.3.8; 16.4.5 carries the 2026-11-03 security fixes), ESLint flat config (`eslint.config.mjs`, `pnpm lint` = `eslint .`), `default.tsx` for the account `@dashboard` and `@login` slots, async `params` on the order-transfer pages, `revalidateTag(tag, { expire: 0 })`, tsconfig `moduleResolution: bundler` / `jsx: react-jsx`. `pnpm lint` reports existing starter-code issues (gift-card stubs, `any`, `@ts-ignore`); lint is not a gate. Starter changes applied (plan §4.2):
1. Standalone pnpm package: `packageManager: pnpm@12.6.0`, own lockfile, settings-only `pnpm-workspace.yaml` (starter root `pnpm.overrides`; `unrs-resolver` build declined, as in the starter).
2. Package renamed `@dtc/storefront` → `ecommerce-storefront`. A `typecheck` script was added, because the starter sets `typescript.ignoreBuildErrors`.
3. `output: "standalone"` + `outputFileTracingRoot: __dirname` in `next.config.js`.
4. Image host from `S3_IMAGE_HOSTNAME` / `S3_IMAGE_PATHNAME` (was `MEDUSA_CLOUD_S3_*`).
5. ~~`generateStaticParams` guarded~~: no longer needed. Since `f677db4` the starter has no `generateStaticParams`, so `next build` never calls the backend and pages render on request (BUILD_PLAN §4.2 change 5, Revision 7).
6. `src/lib/config.ts`: server-side calls prefer the runtime `MEDUSA_BACKEND_URL` (private URL). Verified: a wrong runtime URL breaks SSR and the correct one serves it. `src/middleware.ts` still uses the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL`.
7. `products/[handle]/page.tsx`: `export const dynamic = "force-dynamic"`. The starter's cookie helpers swallow Next's `DynamicServerError`, so pre-rendered or revalidating product pages returned 500 (`DYNAMIC_SERVER_USAGE`) in the Docker image. Reproduced locally and fixed; upstream report medusajs/nextjs-starter-medusa#439 (TASKS F-015).

## Env
- **Build-time** (Dokploy Build-time Arguments): `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (public), `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (required, or the build aborts), `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DEFAULT_REGION`, `NEXT_PUBLIC_STRIPE_KEY`, `S3_IMAGE_HOSTNAME`, `S3_IMAGE_PATHNAME`.
- **Runtime:** `MEDUSA_BACKEND_URL` (internal Dokploy hostname), `PORT=8000`.

## Deploy (Dokploy)
Steps: `../DOKPLOY_STAGING.md` section 4 (Build Path `/`, Docker File `ecommerce/storefront/Dockerfile`, Context `ecommerce/storefront`, Watch Paths `ecommerce/storefront/**`). Use the publishable key whose sales channel holds the products; Medusa's own first-boot key sees none (TASKS F-017).

## Verify (DEV_FLOW §5)
```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder pnpm build   # must pass with the backend down
pnpm typecheck
podman build --build-arg NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder -t ecommerce-storefront:check .
```
The full local stack is in `../docker-compose.local.yml`.
