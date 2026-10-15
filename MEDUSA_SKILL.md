# Medusa v2 Skill: Verified Reference for This Project

> **What this is:** the only Medusa knowledge the builder may use without looking it up again. Every rule below was checked on **2026-09-25** against **Medusa 2.21.1** and re-checked on **2026-10-01** against **2.21.2** and on **2026-10-05** and **2026-10-15** against the current docs (2.21.2 is still npm `latest` on 2026-10-15) (the official docs at docs.medusajs.com, the published `@medusajs/*` packages, and the official `dtc-starter` / `b2b-starter` repos). Each section cites its source.
>
> **Reading order for the builder:** `CLAUDE.md` → `BUILD_PLAN.md` (frozen) → this file → `DEV_FLOW.md` → `TASKS.md`.
>
> **If something you need is not in this file, you must look it up** using the evidence ladder in §0. Never write Medusa code from memory.

---

## 0. Evidence ladder (anti-hallucination rule)

Every API name, import path, option, command or config key you use must be backed by one of these sources, **in this order of trust**:

| Rank | Source | How to check |
|---|---|---|
| 1 | **Installed package types** at the pinned version | `grep -rn "export declare const <name>" node_modules/@medusajs/<pkg>/dist --include='*.d.ts'` |
| 2 | **Official docs as Markdown** | `curl -sL https://docs.medusajs.com/<path>/index.html.md`. Page index: `curl -sL https://docs.medusajs.com/llms.txt`. Full text: `https://docs.medusajs.com/llms-full.txt`. Or the official **Medusa Docs MCP** (`MedusaDocs`, `https://docs.medusajs.com/mcp`, project `.mcp.json`; from `medusajs/medusa-agent-skills`): same docs, same rank. The MCP needs a one-time authorization (`/mcp` in an interactive `claude` terminal); until then use the `curl` form. The docs describe the **latest** Medusa, so rank 1 still wins for our pinned version. |
| 3 | **Official starters** at the matching Medusa version | `github.com/medusajs/dtc-starter` (`apps/backend`, `apps/storefront`), `github.com/medusajs/b2b-starter` |
| 4 | **Release notes** for the version | `github.com/medusajs/medusa/releases/tag/v<version>` |
| 5 | **Package runtime source** (last resort, to confirm behaviour) | `node_modules/@medusajs/medusa/dist/...` |

**Never use:** memory or training data, v1 docs (`docs.medusajs.com/v1/...`), blog posts, community plugins or AI answers, `dist/` import paths.

When the docs and the installed types disagree, **the installed types win** (they are what compiles). Record the disagreement in `TASKS.md` → *Plan deviations & findings log*.

---

## 1. Baseline (verified)

| Item | Value | Source |
|---|---|---|
| Medusa | `2.21.2` (npm `latest`, released 2026-09-28; 2.21.1 before) | `npm view @medusajs/medusa version`; release notes v2.21.2 |
| Node | `^20.19.0 \|\| >=22.12.0` (docs: "v20.19.0+ or v22.12.0+, LTS versions only"; with the Next.js storefront "v24 LTS or lower"). Project uses **Node 22** (Docker `node:22-bookworm-slim` = newest 22.x; CI `node-version: 22`). **Coming in 2.22** (still preview / snapshot only on 2026-10-15; release PR medusajs/medusa#17068 open; `npm view @medusajs/medusa@2.22.0-snapshot-20261008225942 engines` = `>=22.22.0`): Node 20 dropped, **Node ≥ 22.22.0** required (medusajs/medusa#17107); `dtc-starter` already sets `engines.node` `>=22.22.0` (commit `15ef93d`) | `npm view @medusajs/medusa engines`; docs `learn/installation`; `dtc-starter` commits |
| pnpm | `12.6.0` pinned in this repo; supported since Medusa v2.13.0. Newer pnpm exists (`12.11.2` on 2026-10-15); bump only with `scripts/update-medusa.sh` (plan §8 step 2, optional) | `npm view pnpm version`; docs `learn/configurations/pnpm` |
| Versioning | All `@medusajs/*` packages share one version, **except** design-system packages (`@medusajs/ui` = `4.2.x`). This repo pins `@medusajs/ui` to the version `@medusajs/dashboard@<release>` depends on (`4.2.6` for 2.21.2; `4.2.5` for 2.21.1), so the lockfile holds one copy — TASKS.md F-006 | docs `learn/update`; `npm view @medusajs/dashboard@2.21.2 dependencies` |
| Minor releases | **May contain breaking changes.** Always read the release notes | docs `learn/update` |
| Starters | `medusajs/dtc-starter` (the old `medusa-starter-default` and `nextjs-starter-medusa` are deprecated). Latest commit checked: **`f677db4` (2026-10-09)**: removes `generateStaticParams` from the product, collection and category pages (PR #73), so the starter build no longer calls the backend (this repo's storefront already guards them, plan §4.2 change 5). Before it: `15ef93d` (2026-10-02), Medusa 2.21.2 pins + `engines.node`. **`medusajs/b2b-starter`** (Phase 4): `3ed7131` (2026-10-02), Medusa **2.21.2**, `engines.node` `>=22.22.0`, `packageManager` `pnpm@9.15.0` | starter READMEs; `gh api repos/medusajs/dtc-starter/commits` |

### 1.1 Coming in 2.22.0 (preview; not installed, don't use yet)

From the open release PR (medusajs/medusa#17068) and the docs changes queued for it (medusajs/medusa#17065), checked 2026-10-15. Re-verify against the release notes before `scripts/update-medusa.sh`:
- **Node ≥ 22.22.0** (medusajs/medusa#17107). This repo already sets `engines.node` `>=22.22.0` on its backends; Docker `node:22-bookworm-slim` and CI `node-version: 22` resolve to the newest 22.x.
- **`price-list.*` events** (docs "Product Index Examples" → "Changing Price Lists"): can replace the storefront's `revalidate: 600` safety net for price lists (plan §4.2 change 9) and the starter's search TODOs.
- Removing a product option from a product with variants removes the option's values from the variants instead of throwing (docs "Manage Products with the Admin API").
- `@medusajs/ui` **4.2.7** ships with 2.22.0 (pin rule in the Versioning row).

---

## 2. `medusa-config.ts` (production shape for this project)

Source: `learn/deployment/general`, `learn/production/worker-mode`, `resources/infrastructure-modules/*`.

```ts
import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,               // session store (deployment guide)
    workerMode: process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server",
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    },
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    backendUrl: process.env.MEDUSA_BACKEND_URL,
  },
  modules: [
    { resolve: "@medusajs/medusa/caching", options: { providers: [
      { resolve: "@medusajs/caching-redis", id: "caching-redis", is_default: true,
        options: { redisUrl: process.env.REDIS_URL } } ] } },
    { resolve: "@medusajs/medusa/event-bus-redis", options: { redisUrl: process.env.REDIS_URL } },
    { resolve: "@medusajs/medusa/workflow-engine-redis",
      options: { redis: { redisUrl: process.env.REDIS_URL } } },   // `url` deprecated since v2.12.2
    { resolve: "@medusajs/medusa/locking", options: { providers: [
      { resolve: "@medusajs/medusa/locking-redis", id: "locking-redis", is_default: true,
        options: { redisUrl: process.env.REDIS_URL } } ] } },
    // custom modules: { resolve: "./src/modules/<name>" }
  ],
})
```

The snippet above is the pattern only. The real config makes the Redis modules conditional on `REDIS_URL` and S3 conditional on `S3_*`, as `BUILD_PLAN.md` §4.1 requires.

| Rule | Source |
|---|---|
| The Caching Module needs **`MEDUSA_FF_CACHING=true`** and the separate npm package **`@medusajs/caching-redis`**. `cache-redis` has been deprecated since v2.11.0 | `resources/infrastructure-modules/caching` |
| **Postgres SSL default:** if `DATABASE_URL` matches `localhost\|127.0.0.1\|ssl_mode=(disable\|false)\|sslmode=disable`, SSL is off; **otherwise SSL is ON** (`{ rejectUnauthorized: false }`). An internal Postgres without SSL (Dokploy `<project>-postgres`, compose `postgres`) therefore hangs migrations. This project sets `projectConfig.databaseDriverOptions = { connection: { ssl: false } }` when `DATABASE_SSL=false`. Verified: reproduced with a non-localhost URL, fixed by this option. A `?ssl_mode=disable` URL param alone did **not** fix the migration connection | `@medusajs/utils/dist/modules-sdk/load-module-database-config.js` (`getDefaultDriverOptions`); docs `learn/configurations/medusa-config#databasedriveroptions` |
| `loadEnv` only supports `NODE_ENV` values `development`, `production`, `staging`, `test` | `learn/fundamentals/environment-variables` |
| S3 provider: `resolve: "@medusajs/medusa/file"` with provider `@medusajs/medusa/file-s3`. Options: `file_url`, `access_key_id`, `secret_access_key`, `region`, `bucket`, `endpoint`, `additional_client_config` (e.g. `forcePathStyle` for MinIO) | `resources/infrastructure-modules/file/s3` |
| Stripe: provider `@medusajs/medusa/payment-stripe` with options `apiKey` and `webhookSecret` (required when deployed). Webhook URL: `{server_url}/hooks/payment/{provider_id}` → `/hooks/payment/stripe_stripe`. **Not used by ecommerce** (Stripe is not available in Cambodia, TASKS F-022); custom providers: §15 | `resources/commerce-modules/payment/payment-provider/stripe` |
| The system payment provider `pp_system_default` is built in (manual payments) | `resources/commerce-modules/payment/payment-provider` |
| The **Search Module** is registered by default since 2.21.1 (PostgreSQL provider). Indexes live in `src/search/*.ts` (the starter ships `product.ts`) | `resources/infrastructure-modules/search` |
| Feature flags present in the 2.21.1 and 2.21.2 package source: `MEDUSA_FF_CACHING`, `MEDUSA_FF_RBAC` (default **off**; how to enable it is **not documented**, though the admin RBAC API is in the JS SDK reference since v2.15.5: `sdk.admin.rbacRole`, `sdk.admin.rbacPolicy`; open dashboard issue medusajs/medusa#15945, sidebar ignores permissions, fix PR #15620 open), `MEDUSA_FF_RBAC_FILTER_FIELDS`, `MEDUSA_FF_INDEX_ENGINE`, `MEDUSA_FF_TRANSLATION`, `MEDUSA_FF_VIEW_CONFIGURATIONS`, `MEDUSA_FF_BACKEND_HMR`. **Only enable a flag the docs document** (currently: caching) | `node_modules/@medusajs/medusa/dist/feature-flags/*.js` |
| Admin customizations read env vars only with the `VITE_` prefix, via `import.meta.env` | `learn/fundamentals/environment-variables` |

---

## 3. Modules (custom data)

Source: `learn/fundamentals/modules`, `learn/fundamentals/data-models/properties`.

```ts
// src/modules/<name>/models/<model>.ts
import { model } from "@medusajs/framework/utils"
const Post = model.define("post", {          // table name: snake_case
  id: model.id().primaryKey(),
  title: model.text(),
})
export default Post

// src/modules/<name>/service.ts
import { MedusaService } from "@medusajs/framework/utils"
class BlogModuleService extends MedusaService({ Post }) {}
export default BlogModuleService

// src/modules/<name>/index.ts
import { Module } from "@medusajs/framework/utils"
export const BLOG_MODULE = "blog"            // alphanumeric + underscore only
export default Module(BLOG_MODULE, { service: BlogModuleService })
```

- Register the module in `medusa-config.ts`: `modules: [{ resolve: "./src/modules/blog" }]`.
- **Property types:** `id`, `text`, `number`, `float`, `bigNumber` (use for money; it also stores `raw_<name>`), `boolean`, `enum([...])`, `dateTime`, `json` (typed `json<T>()` since v2.19), `array` (`text[]`).
- **Modifiers:** `.primaryKey()`, `.default(v)`, `.nullable()`, `.unique()`, `.index()`, `.searchable()`, `.checks([...])`.
- **Composite / unique indexes:** `model.define(...).indexes([{ on: ["a", "b"], unique: true, where: {...} }])` (docs `learn/fundamentals/data-models/indexes`; `@medusajs/types` `EntityIndex`). The generated SQL ignores soft-deleted rows (`WHERE deleted_at IS NULL`). Adding a unique index to a table that already has data: make the generated migration clean up existing duplicates first, or the deploy fails (project rule, `telegram_links` `Migration20261005110738`).
- `created_at`, `updated_at` and `deleted_at` are added automatically. Don't declare them.
- **Generated service methods** come from the keys of the object passed to `MedusaService({...})`: `createPosts`, `retrievePost`, `listPosts`, `updatePosts`, `deletePosts`, `softDeletePosts`, … (reference: `resources/service-factory-reference`). *Plan spike (§9):* the method name comes from the object key, not the table name.
- **Migrations:** `npx medusa db:generate <module>` creates `src/modules/<name>/migrations/Migration*.ts`. It needs a reachable database. **Commit the migration and its `.snapshot-*.json`.** Migration imports come from `@medusajs/framework/mikro-orm/migrations` (since v2.11.0).
- **Isolation:** never add columns to core tables, and never put foreign keys into core tables. Relate data with module links (§4).

---

## 4. Module links

Source: `learn/fundamentals/module-links`, `.../module-links/link`.

```ts
// src/links/blog-product.ts
import BlogModule from "../modules/blog"
import ProductModule from "@medusajs/medusa/product"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  ProductModule.linkable.product,
  { linkable: BlogModule.linkable.post, isList: true },   // isList: many side; deleteCascade: true optional
)
```

- **Many-to-many:** `isList: true` on both sides.
- **Linkable names:** `Module.linkable.<camelCase of model name>`. For example `booking_resource` → `linkable.bookingResource` (plan spike §9).
- **Create links** outside workflows: `const link = container.resolve(ContainerRegistrationKeys.LINK); await link.create({ [Modules.PRODUCT]: { product_id }, blog: { post_id } })`.
- **Create links in workflows:** `createRemoteLinkStep(linkData)`. Remove them with `dismissRemoteLinkStep` (both from `@medusajs/medusa/core-flows`).
- `db:migrate` syncs link tables. Removing or changing a link is an **unsafe** change (§11).
- **Read-only links:** `defineLink({ linkable: Mod.linkable.x.id, field: "<id column>" }, Other.linkable.y, { readOnly: true })` creates **no link table**; it only lets Query follow the stored ID (docs wishlist guide, Step 5). This repo: `src/links/wishlist-*.ts`.
- **Core link field aliases used in this repo** (verified in `@medusajs/link-modules/dist/definitions`): `payment_collection.cart` and `cart.payment_collection` (cart ↔ payment collection); `fulfillment.order` (order ↔ fulfillment); `order.payment_collections` (order ↔ payment collection, a list; `order-payment-collection.js`, used by POS close-shift). Query them like normal fields, e.g. `fields: ["cart.email"]` on `payment_collection`.

## 5. Query (reading across modules)

Source: `learn/fundamentals/query`.

```ts
const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
const { data } = await query.graph({ entity: "post", fields: ["id", "title", "product.*"], filters: { id } })
```

In workflows, use `useQueryGraphStep({ entity, fields, filters })` from `@medusajs/medusa/core-flows`. Call `.config({ name: "unique-name" })` when you use it more than once in one workflow.

---

## 6. Workflows (all business logic)

Source: `learn/fundamentals/workflows`, `.../constructor-constraints`, `.../conditions`, `.../workflow-hooks`, `.../execute-another-workflow`, `.../events-and-subscribers/emit-event`.

```ts
import { createStep, createWorkflow, StepResponse, WorkflowResponse, transform, when }
  from "@medusajs/framework/workflows-sdk"

const createPostStep = createStep(
  "create-post",
  async ({ title }: { title: string }, { container }) => {
    const svc: BlogModuleService = container.resolve(BLOG_MODULE)
    const post = await svc.createPosts({ title })
    return new StepResponse(post, post)            // (output, compensation input)
  },
  async (post, { container }) => {                 // compensation = rollback
    if (!post) return
    await container.resolve<BlogModuleService>(BLOG_MODULE).deletePosts(post.id)
  }
)

export const createPostWorkflow = createWorkflow("create-post",
  function (input: { title: string }) {            // NOT async
    const post = createPostStep(input)
    return new WorkflowResponse(post)
  })

// run it: await createPostWorkflow(req.scope).run({ input: { title } })  → { result }
```

**Constructor constraints.** The function passed to `createWorkflow` only builds a definition; nothing inside it runs at build time:

| Don't | Do instead |
|---|---|
| `async` function | plain `function` |
| Manipulating variables, template strings, `new Date()` | `transform({ a, b }, (d) => ...)` |
| `if`, ternary, `\|\|`, `??`, `!!`, `?.` | `when("unique-name", input, (i) => cond).then(() => step())` |
| `try/catch`, object spreading, loops | do these in a step or inside `transform` |

- **Returning:** wrap results in `new WorkflowResponse(...)`. *Plan spike:* returning a `when(...).then(...)` result directly fails the type check. Wrap it: `new WorkflowResponse({ result })`.
- **Nesting:** `someWorkflow.runAsStep({ input })` returns the output directly, with no `.result`.
- **Events:** `emitEventStep({ eventName: "custom.created", data })` emits only after the workflow succeeds.
- **Consuming core hooks** (`src/workflows/hooks/*.ts`):
  `createProductsWorkflow.hooks.productsCreated(async ({ products, additional_data }, { container }) => { ... return new StepResponse(undefined, compInput) }, async (compInput, { container }) => { /* undo */ })`
- **Cart hooks used by this project** (verified in the workflow reference and the 2.21.1 types):
  - `addToCartWorkflow.hooks.validate`, `addToCartWorkflow.hooks.setPricingContext`
  - `updateLineItemInCartWorkflow.hooks.validate`, `.setPricingContext`
  - `completeCartWorkflow.hooks.validate`: runs **before** the order is created and payment authorized. **Never mutate the cart** in it. Validation must stay idempotent on retry.
- **Wrapping `completeCartWorkflow`** (e.g. marketplace `complete-vendor`): use `acquireLockStep({ key: cart_id, timeout, ttl })` … `releaseLockStep({ key: cart_id })`, and check existing links through the link's `entryPoint` before creating records. The core workflow is idempotent, so your steps must be too. If completion fails after payment, the payment is reverted automatically.
- **Locks** (verified 2.21.2, `core-flows/dist/locking/steps/acquire-lock.d.ts`): `acquireLockStep({ key: string | string[], timeout? /* s to wait, default 0 */, retryInterval?, ttl? /* s */, ownerId?, provider? })`; its compensation releases the lock when a later step fails. Build a key from input with `transform` (no template strings in the constructor). POS shift workflows lock `pos-register:<id>` and `pos-shift:<id>` (`pos/backend/src/workflows/pos-shift.ts`).
- **Money math:** `MathBN` from `@medusajs/framework/utils` (`add`, `sub`, `mult`, `div`, `convert`, `gt`/`lt`/`eq`, …; `utils/dist/totals/math.d.ts`) instead of JavaScript floats; `.toNumber()` for the result. `bigNumber` model fields come back as numbers or BigNumber objects; pass them straight to `MathBN`.
- **Payment records** (verified 2.21.2, `@medusajs/payment/dist/services/payment-module.js`): `authorizePaymentSession` creates the payment with `data` = the **provider's** authorize result, so the system provider (`pp_system_default`) leaves `payment.data` = `{}` (`providers/system.js`); the payment session's `metadata` is stored as given in `createPaymentSession(collectionId, { provider_id, currency_code, amount, data, metadata })`, and `payment.payment_session` links back to it. `UpdatePaymentDTO` has only `id`, so a payment's own fields can't be tagged later. **Tag a payment through its session `metadata`** (POS: `metadata.pos_payment_method = "cash"`, read by close-shift).
- **Draft orders** (verified 2.21.2, `@medusajs/medusa/dist/api/admin/draft-orders/route.js`, `core-flows/dist/order/workflows/create-order.js`, `draft-order/workflows/convert-draft-order.js`): a draft order is `createOrderWorkflow` with `status: OrderStatus.DRAFT` and `is_draft_order: true`, which is how the admin route creates one. `CreateOrderDTO` has no `is_draft_order` field, so type the input as `CreateOrderWorkflowInput & { is_draft_order: boolean }`. Items need only `variant_id` and `quantity`, because the workflow prices them in the region and currency. The type still asks for `title` and `unit_price`, so cast the items. `promo_codes` applies the promotions through `refreshDraftOrderAdjustmentsWorkflow`; an unknown code throws "The promotion code X is invalid" and the draft is rolled back. With no `customer_id` or `email`, the order has no customer. `convertDraftOrderWorkflow({ id })` re-taxes, reserves inventory in the sales channel's locations, sets the status to `pending` and emits `order.placed`. It takes its own lock on the order id. **Pay the order:** `createOrderPaymentCollectionWorkflow({ order_id, amount })` creates the collection and links it, then call `createPaymentSession` with `metadata`, then `authorizePaymentSessionStep({ id, context })`, then `capturePaymentWorkflow({ payment_id, captured_by, amount })`. Core's `markPaymentCollectionAsPaid` follows the same path but can't set session metadata. Used by `pos/backend/src/workflows/pos-checkout.ts`.
- **Core workflows and steps verified in 2.21.1 and 2.21.2** (`@medusajs/medusa/core-flows`): `acquireLockStep`, `releaseLockStep`, `useQueryGraphStep`, `createRemoteLinkStep`, `dismissRemoteLinkStep`, `emitEventStep`, `setAuthAppMetadataStep`, `createOrderWorkflow`, `completeCartWorkflow`, `addToCartWorkflow`, `updateLineItemInCartWorkflow`, `convertDraftOrderWorkflow`; also used and verified in 2.21.2: `sendNotificationsStep`, `updateRegionsWorkflow`, `createShippingProfilesWorkflow`, `createDefaultsWorkflow`, `createPaymentSessionsWorkflow`, `deletePaymentSessionsWorkflow`, `refreshPaymentCollectionForCartWorkflow`, `processPaymentWorkflow`, `createOrderPaymentCollectionWorkflow`, `authorizePaymentSessionStep`, `capturePaymentWorkflow`. Before using any other name, check that it exists with ladder step 1.

---

## 7. API routes, validation, middlewares, auth, CORS

Source: `learn/fundamentals/api-routes`, `.../validation`, `.../middlewares`, `.../protected-routes`, `.../cors`, `.../errors`, `resources/commerce-modules/auth/create-actor-type`.

```ts
// src/api/store/custom/route.ts  → GET /store/custom (file-based routing; [id] = path param)
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
export const GET = async (req: MedusaRequest, res: MedusaResponse) => { res.json({ ok: true }) }
```

```ts
// src/api/middlewares.ts
import { defineMiddlewares, validateAndTransformBody, authenticate } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"        // NOT "zod" (v2.13 codemod replace-zod-imports)

export const PostSchema = z.object({ a: z.number() })
export default defineMiddlewares({ routes: [
  { matcher: "/custom", method: "POST", middlewares: [validateAndTransformBody(PostSchema)] },
  { matcher: "/vendors*", middlewares: [authenticate("vendor", ["session", "bearer"])] },
]})
// route: req.validatedBody (body), req.validatedQuery (validateAndTransformQuery)
```

- **Order:** global middlewares run first (core, then plugins, then this app), then route middlewares (core, then plugins, then this app), then the route handler; within each group, matchers sort as wildcard → regex → static → static with params (docs `learn/fundamentals/api-routes/middlewares`, "How Are Middlewares Ordered and Applied?"). So a project middleware on a core route runs **after** the core's own middlewares, e.g. after the multer parsing on `POST /admin/uploads` (`req.files` is set, nothing is stored yet).
- **Built-in protection:** `/admin/*` requires an admin user and `/store/customers/me*` requires a customer. To opt out, export `AUTHENTICATE = false` from the route file.
- **Custom auth:** `authenticate("customer" | "user" | "<actor>", ["session", "bearer", "api-key"], { allowUnauthenticated? })`. Use `AuthenticatedMedusaRequest` and read `req.auth_context.actor_id`.
- **Custom actor type** (vendor, seller, cashier): register with `POST /auth/<actor>/emailpass/register`, create the record in a workflow, then call `setAuthAppMetadataStep({ authIdentityId, actorType: "<actor>", value: record.id })`. Log in with `POST /auth/<actor>/emailpass`. Verified in 2.21.2 (POS P2-03): the route that links the actor needs `authenticate("<actor>", ["bearer"], { allowUnregistered: true })`; there `req.auth_context.auth_identity_id` is set and `actor_id` is empty until linked. `setAuthAppMetadataStep` throws if `app_metadata.<actor>_id` already exists and removes it again as compensation (`@medusajs/core-flows/dist/auth/steps/set-auth-app-metadata.js`). An emailpass identity's email: `retrieveAuthIdentity(id, { relations: ["provider_identities"] })` → `provider_identities[].entity_id`. An unlinked identity can still sign in at `/auth/<actor>/emailpass`, but `authenticate("<actor>", …)` without `allowUnregistered` refuses its token (401). **When the actor acts for the shop (cashier, vendor admin, seller), never let a registration token create the actor on its own**: this repo's pattern is invite-only, an admin creates the record and the registered email must match it (`pos/backend/src/workflows/pos-cashier.ts`, TASKS F-036). Email verification applies only to actor types listed in `http.authVerificationsPerActor`.
- **CORS:** `storeCors` and `adminCors` apply **only** to `/store*` and `/admin*`. **Any other prefix** (`/vendors`, `/sellers`, `/pos`) needs its own middleware using `cors` + `parseCorsOrigins(...)` (docs snippet in `learn/fundamentals/api-routes/cors`). The docs snippet imports the `cors` package. pnpm doesn't allow undeclared imports, so add `cors` + `@types/cors` to `package.json` (pnpm rule, not a Medusa doc statement). CORS values may be regex strings (`/.../`) (`learn/configurations/medusa-config`).
- **Errors:** `throw new MedusaError(MedusaError.Types.INVALID_DATA | NOT_FOUND | NOT_ALLOWED | UNAUTHORIZED | DUPLICATE_ERROR | UNEXPECTED_STATE | INVALID_ARGUMENT, "message")` (import from `@medusajs/framework/utils`). HTTP status (verified 2.21.2, `@medusajs/framework/dist/http/middlewares/error-handler.js`): `INVALID_DATA` and `NOT_ALLOWED` → 400, `UNAUTHORIZED` → 401, `FORBIDDEN` → 403, `NOT_FOUND` → 404, `DUPLICATE_ERROR` → 422.
- **Store routes** need the `x-publishable-api-key` header.
- **2.21.2 changes that matter here** (release notes v2.21.2): `/store/search` only returns fields **defined on the index** (no more hydration through `query.graph`), so every field a storefront reads must be `.retrievable()` in `src/search/*.ts`; the payment webhook route also accepts the `pp_`-prefixed provider ID (`/hooks/payment/pp_payway_payway`); the new `@medusajs/eslint-plugin` rules warn on `throw new Error(...)` (use `MedusaError`) and on magic container keys such as `"logger"` (use `ContainerRegistrationKeys`). The key decides the sales channel (`resources/storefront-development/publishable-api-keys`).

---

## 8. Subscribers & scheduled jobs

Source: `learn/fundamentals/events-and-subscribers`, `learn/fundamentals/scheduled-jobs`.

```ts
// src/subscribers/order-placed.ts
import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
export default async function handler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  await someWorkflow(container).run({ input: { id: data.id } })
}
export const config: SubscriberConfig = { event: "order.placed" }

// src/jobs/release-holds.ts
import { MedusaContainer } from "@medusajs/framework/types"
export default async function job(container: MedusaContainer) { await wf(container).run() }
export const config = { name: "release-expired-holds", schedule: "* * * * *" }
```

- **Payloads used in this repo** (docs `resources/references/events`): `order.placed` and `order.canceled` `{ id }` (order ID); `shipment.created` `{ id, no_notification }` and `delivery.created` `{ id }`, where `id` is the **fulfillment** ID (reach the order through `fulfillment.order`, §4).
- Subscribers and jobs run on the **worker** instance (docs: "a worker instance that processes background tasks. This includes scheduled jobs and subscribers").
- **Project rule** (BUILD_PLAN §6.5 acceptance, not a documented Medusa guarantee): handlers must be **idempotent**. Guard with a unique key (e.g. `order_id` unique) so a repeated event or a retried job never creates duplicates.

## 9. Admin extensions

Source: `learn/fundamentals/admin/widgets`, `.../ui-routes`.

```tsx
// src/admin/widgets/product-widget.tsx
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Container, Heading } from "@medusajs/ui"
import { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types"
const Widget = ({ data }: DetailWidgetProps<AdminProduct>) => <Container><Heading level="h2">…</Heading></Container>
export const config = defineWidgetConfig({ zone: "product.details" })
export default Widget
```

UI routes go in `src/admin/routes/<path>/page.tsx`. Before using a widget zone name, look it up in the docs' injection-zones reference.

---

## 10. Testing

Source: `learn/debugging-and-testing/testing-tools/*`.

```ts
// integration-tests/http/<name>.spec.ts
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
jest.setTimeout(60 * 1000)
medusaIntegrationTestRunner({ testSuite: ({ api, getContainer }) => {
  it("works", async () => { const r = await api.get("/custom"); expect(r.status).toEqual(200) })
}})

// src/modules/<name>/__tests__/service.spec.ts
import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
moduleIntegrationTestRunner<BlogModuleService>({ moduleName: BLOG_MODULE, moduleModels: [Post],
  resolve: "./src/modules/blog", testSuite: ({ service }) => { /* … */ } })
```

- **Scripts** (from `dtc-starter`): `test:integration:http`, `test:integration:modules`, `test:unit`. They run jest with `TEST_TYPE=…` and `NODE_OPTIONS=--experimental-vm-modules --runInBand --forceExit`.
- **Test database:** `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` (defaults: `localhost`, `5432`, `postgres`, empty). `medusaIntegrationTestRunner` creates `medusa-{random-id}-integration-{worker-id}` and drops it after the tests. Clean up records you create in `afterAll`.

## 11. CLI (verified in the 2.21.1 and 2.21.2 CLI source and the CLI reference)

| Command | Use |
|---|---|
| `medusa develop` / `medusa build` / `medusa start` | Dev server / production build to `.medusa/server` / start the build |
| `medusa db:generate <module…>` | Generate migrations for custom modules |
| `medusa db:migrate --execute-safe-links --execute-safe-search` | **Only form allowed in containers.** Without these flags it *prompts* on unsafe link or search changes |
| `medusa db:sync-links --execute-all` | Manual, reviewed: apply link deletions or updates |
| `medusa db:migrate:search --execute-all-search` | Manual, reviewed: drop search indexes no longer defined |
| `medusa db:rollback <module…>` | Official revert of a module's last migrations (`learn/update`) |
| `medusa user -e <email> -p <pw>` | Create an admin user |
| `medusa exec ./src/scripts/<file>.ts [args]` | Run a script (seed) |
| `medusa plugin:develop \| plugin:build \| plugin:db:generate \| plugin:publish \| plugin:add` | Plugin lifecycle (`learn/fundamentals/plugins`) |

`db:migrate` takes a Postgres **advisory lock per module** (`pg_advisory_xact_lock(hashtext('db-module-migration:<module>'))`, in `@medusajs/modules-sdk/dist/medusa-app.js`, verified 2.21.1). Still run one migrating instance per deploy: the lock serializes each module's migration, not the whole deploy. It also runs `src/migration-scripts/*` (skip with `--skip-scripts`). **Any file in `src/migration-scripts/` runs automatically in production**, so never put demo seeds there.

**Connection check:** before migrating, `db:migrate` runs `SELECT 1` with a timeout of `MEDUSA_DB_MIGRATION_CONNECTION_TIMEOUT` (default 10000 ms). The pool hides connect errors (`propagateCreateError: false`), so a wrong URL **or wrong SSL setting** shows up as "The connection timed out after 10 seconds", not as the real error.

## 12. pnpm and build facts (plan spike §9, docs pnpm guide)

- Hoisting: the docs put `public-hoist-pattern[]` for `*@medusajs/*`, `@tanstack/react-query`, `react-i18next` and `react-router-dom` in `.npmrc`. pnpm ≥ 11 ignores these there, so this project puts them in `pnpm-workspace.yaml` as `publicHoistPattern`.
- pnpm 12 blocks install scripts until `allowBuilds` is set (`@swc/core`, `esbuild`, `msgpackr-extract`, `protobufjs`).
- `medusa build` doesn't copy the lockfile into `.medusa/server`. Copy it there before `pnpm install --prod --frozen-lockfile`.
- `tsc --noEmit` needs `.medusa/types`, so **build before typecheck**.
- `medusa start` must run **inside `.medusa/server`** after its own prod install. From the project root it fails with "Could not find index.html in the admin build directory" (verified 2.21.1; docs `learn/deployment/general`).
- The `medusaIntegrationTestRunner` teardown can log `[Search] Failed to seed "product" … terminating connection due to administrator command`. The Search Module seeds its index on app start and the runner drops the test database under it. The tests still pass; this is noise, not a failure (observed 2.21.1).
- Plugin or shared packages that import `@medusajs/framework` must declare it as a `peerDependency`, not a `devDependency` (docs pnpm guide).

## 13. Scenario → official reference map

| Plan section | Official reference to follow |
|---|---|
| 6.1 Ecommerce | `resources/recipes` (Ecommerce), `dtc-starter` |
| 6.2 POS | `resources/recipes/pos` (draft orders, barcode on variant `barcode`/`ean`/`upc`), `resources/commerce-modules/auth/create-actor-type` |
| 6.3 Booking | `resources/recipes/ticket-booking` + `/example`; `completeCartWorkflow` reference ("Custom Validation with Conflicts") |
| 6.4 Wholesale | `resources/recipes/b2b`, `github.com/medusajs/b2b-starter` |
| 6.5 Reseller | `resources/commerce-modules/auth/create-actor-type`, `resources/storefront-development/publishable-api-keys` |
| 6.6 Marketplace | `resources/recipes/marketplace/examples/vendors` (`/store/carts/:id/complete-vendor`) |

## 14. Refreshing this skill

This file is pinned to **2.21.2** (refreshed 2026-10-01 from 2.21.1: §1 and §6 checks re-run against `node_modules`; re-checked 2026-10-15: §1 versions, starters, RBAC flag note, new §1.1 2.22 preview notes; re-checked 2026-10-05 against the current docs: §1 Node and starter, §3 indexes, §4 link aliases, §6 core-flows (20 names), §7 middleware order, §8 event payloads, §11 CLI flags, new §15 providers). When `scripts/update-medusa.sh` moves to a new version:

1. Read the release notes for every version you skip.
2. Re-run the checks in §1 and the core-flows export check in §6 against the new `node_modules`.
3. Update the version header and any rule that changed, citing the new source.
4. Commit as `docs(skill): refresh Medusa skill for v<version>`.

`BUILD_PLAN.md` is **not** edited during a refresh (see `CLAUDE.md`).

## 15. Module providers (payment, notification)

Source: `resources/references/payment/provider`, `resources/references/notification-provider-module`, `resources/infrastructure-modules/notification`; behaviour notes from the installed 2.21.2 runtime (ladder rank 5).

**Payment provider** (`src/modules/<name>/service.ts` + `index.ts`):
- `class X extends AbstractPaymentProvider<Options>` (`@medusajs/framework/utils`), `static identifier = "<id>"`, optional `static validateOptions(options)`; export with `ModuleProvider(Modules.PAYMENT, { services: [X] })`; register under the `@medusajs/medusa/payment` module's `providers` with an `id`.
- The provider ID is **`pp_{identifier}_{id}`**; the webhook route is `/hooks/payment/{identifier}_{id}` (2.21.2 also accepts the `pp_` form). `pp_system_default` is always registered.
- `getWebhookActionAndData` returns `{ action: PaymentActions.SUCCESSFUL | AUTHORIZED | FAILED | NOT_SUPPORTED …, data: { session_id, amount } }`; returning **captured/successful** lets Medusa complete the cart from the webhook alone. Verify the request (signature) inside this method.
- `authorizePayment` returning status `captured` means the money is already taken (no separate capture step).
- **`deletePayment` runs before a session is replaced.** Creating a new session deletes the collection's active one first (core-flows `create-payment-session.js`: "deleting an existing active session before creating a new one"), and so does a cart change (`refreshPaymentCollectionForCartWorkflow`). The payment module calls the provider's `deletePayment` **before** deleting the row, and an error thrown there stops the replacement (`deletePaymentSessionsStep` + `validateDeletedPaymentSessionsStep` → "Could not delete all payment sessions"). Use it to protect a payment that may still complete on the provider's side (this repo: ABA PayWay refuses if paid, closes the transaction if not).

**Account emails** (docs `resources/commerce-modules/auth/email-verification` since v2.16, `.../auth/reset-password`; storefront guides `storefront-development/customers/verify-account` and `.../reset-password`; event names from `AuthWorkflowEvents` in `@medusajs/framework/utils`):
- Email verification: `projectConfig.http.authVerificationsPerActor = { customer: [{ entity_type: "email", auth_provider: "emailpass" }] }`. Login then answers `{ verification_required: true, token }` until verified; the storefront calls `POST /auth/verification/request` (Bearer that token) and `POST /auth/verification/confirm { code }`. Event `auth.verification_requested` payload (since v2.17): `entity_id`, `entity_type`, `code`, `code_provider`, `auth_identity_id`, `expires_at`, `metadata`.
- Password reset: `POST /auth/{actor}/emailpass/reset-password { identifier }` always answers success; event `auth.password_reset` `{ entity_id, actor_type, token, metadata }`; token single-use, 15 minutes; `POST /auth/{actor}/emailpass/update { email, password }` with the token as `Authorization: Bearer` (since v2.6). No store route changes a password with the old one; this repo adds `POST /store/customers/me/password` using the Auth Module's `authenticate("emailpass", { body: { email, password } })` then `updateProvider("emailpass", { entity_id, password })`. **`entity_id` is the login email** (the installed `@medusajs/auth-emailpass` `update` looks the provider identity up by it), not the actor ID the reference example shows (TASKS F-032). The admin has its own page at `<admin path>/reset-password?token=&email=`.
- Links use `admin.storefrontUrl` (customers) and `admin.backendUrl` + `admin.path` (default `/app`, admins). This repo: `src/subscribers/auth-*.ts`.
- After creating the customer with a registration token (no `actor_id`), `POST /auth/token/refresh` with that token returns a token that carries the customer (core route `auth/token/refresh`; docs "Third-Party or Social Login in Storefront"); no second sign-in needed.
- `POST /auth/{actor}/emailpass/reset-password` answers **201 with a plain-text body**: send `accept: text/plain` (as `sdk.auth.resetPassword` does) when calling it with `sdk.client.fetch`. Its body validator is `{ identifier, metadata? }`, so extra data (e.g. a CAPTCHA token) goes in a header. The same token is created by `generateResetPasswordTokenWorkflow` (core-flows), usable from your own routes.
- **Admin 2FA (MFA, v2.15.5+):** set `AUTH_MFA_ENCRYPTION_KEY` (64 random characters; changing it later breaks enrolled factors); the dashboard has the screens. Listing `@medusajs/medusa/auth` in `modules` **replaces** the default entry (only the `mfa` defaults are merged back, `@medusajs/utils` define-config), so list `{ resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass" }` in `providers` yourself. `mfa.disable_policy: "challenge"` requires a code to switch 2FA off. With 2FA on, `/auth/user/emailpass` returns `{ mfa_challenge: { id, methods }, token }` where the token has no actor (refused by `/admin`); `POST /auth/mfa/challenges/:id/verify { method, code }` with that token as Bearer returns the real token.
- Project middlewares can guard Medusa's own auth routes (e.g. `/auth/customer/emailpass`, `/register`, `/reset-password`); they run after the core route middlewares (§7). This repo: CAPTCHA, password minimum, verification resend limit (`src/api/auth-guards.ts`).

**Notification provider:**
- `class X extends AbstractNotificationProviderService` (`@medusajs/framework/utils`), `static identifier`, `async send(notification)` returning `{ id }`; register under `@medusajs/medusa/notification` `providers` with `id` and `options.channels: ["email"]` (one provider per channel; this repo also uses custom channels `telegram` and `telegram_customer`).
- Send from workflows with `sendNotificationsStep([{ to, channel, template, data, idempotency_key?, provider_data? }])` (core-flows). A notification whose `idempotency_key` already succeeded is skipped, a failed one is retried (`@medusajs/notification` `createNotifications`). Sent messages can't be undone, so there is no compensation.
- Throwing a `MedusaError` in `send` marks the notification as failed. Give outgoing `fetch` calls a timeout (`AbortSignal.timeout(...)`) so a hung provider can't hold the job (project rule).
