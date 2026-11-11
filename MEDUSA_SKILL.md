# Medusa v2 Skill: Verified Reference for This Project

> **What this is:** the only Medusa knowledge the builder may use without looking it up again. Every rule below was checked on **2026-09-25** against **Medusa 2.21.1** and re-checked on **2026-10-01** against **2.21.2** and on **2026-10-05** and **2026-10-15** against the current docs (2.21.2 is still npm `latest` on 2026-10-15), and on **2026-10-26** against the **2.22.0 / 2.22.1** release (now npm `latest`; and on **2026-11-06** against **2.22.3** (§1.3), and on **2026-11-10** against **2.22.6**, which every app in this repo now runs (§1.4; earlier: 2.21.2 in ecommerce and pos, 2.22.2 in booking-services) (the official docs at docs.medusajs.com, the published `@medusajs/*` packages, and the official `dtc-starter` / `b2b-starter` repos). Each section cites its source.
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
| Medusa | **Installed in every app: `2.22.6`** (npm `latest`, released 2026-11-09, a security release; installed 2026-11-10 with `scripts/update-medusa.sh all 2.22.6`, TASKS V-06). History: 2.22.3 (2026-11-04) in every app 2026-11-06 to 2026-11-10 (V-01); 2.21.2 (2026-09-28) in ecommerce and pos until 2026-11-06; 2.22.2 (2026-10-30) in booking-services from 2026-11-04 (F-044); 2.22.0 came on 2026-10-21, 2.22.1 on 2026-10-23. Rank 1 of §0 is **the installed `node_modules` of the app you work in** (§1.1 to §1.4) | `npm view @medusajs/medusa dist-tags time`; docs `learn/update` |
| Node | 2.21.2: `^20.19.0 \|\| >=22.12.0`. **2.22.x: `>=22.22.0`** (Node 20 dropped, medusajs/medusa#17089; docs: "Node.js v22.22.0+ (LTS versions only)", with the Next.js storefront "v24 LTS or lower"). The official starters set `engines.node` `>=22.23.4`, and so does every app here since 2026-11-06. Project uses **Node 22** (Docker `node:22-bookworm-slim` = newest 22.x; CI `node-version: 22`), so the bound is met | `npm view @medusajs/medusa@2.22.1 engines`; docs `learn/installation`; starters' `package.json` |
| pnpm | `12.17.0` pinned in every app since 2026-11-06 (was `12.6.0`; TASKS V-03); supported since Medusa v2.13.0. `12.18.0` (2026-11-05) is left until it is a week old (from 2026-11-12, TASKS V-07); bump only with `scripts/update-medusa.sh` (plan §8 step 2, optional) | `npm view pnpm version`; docs `learn/configurations/pnpm` |
| Versioning | All `@medusajs/*` packages share one version, **except** design-system packages (`@medusajs/ui` = `4.2.x`). This repo pins `@medusajs/ui` to the version `@medusajs/dashboard@<release>` depends on (`4.2.6` for 2.21.2; `4.2.5` for 2.21.1; `4.2.8` for 2.22.1; `4.2.9` for 2.22.2; `4.2.10` for 2.22.3; **`4.2.13` for 2.22.6**, while the 2.22.6 starters still pin `4.2.9`), so the lockfile holds one copy — TASKS.md F-006. The starters still pin `4.2.6` with 2.22.1; our rule follows the dashboard, which is what `scripts/update-medusa.sh` reads | docs `learn/update`; `npm view @medusajs/dashboard@2.22.1 dependencies` |
| Minor releases | **May contain breaking changes.** Always read the release notes | docs `learn/update` |
| Starters | `medusajs/dtc-starter` (the old `medusa-starter-default` and `nextjs-starter-medusa` are deprecated). **Latest commit checked: `6440e85` (2026-11-09), Medusa 2.22.6** (`apps/backend/package.json`, checked 2026-11-11). **`medusajs/b2b-starter`: `f352e3c` (2026-11-09), Medusa 2.22.6**; `wholesale/backend` was copied from `47eecab` (the last 2.22.3 commit, §1.3, F-055) and moved to 2.22.6; the wholesale storefront (P4-08) is copied from `f352e3c`. Our web clients are on Next.js **16.4.5** with the starter's Next.js 16 migration (`6b95717`) applied (TASKS V-04, plan §8.1). History: `f677db4` (2026-10-09) removed `generateStaticParams` from the product, collection and category pages, so the starter build no longer calls the backend (plan §4.2 change 5 only matters for older copies); `6b95717` moved the storefront to Next.js 16 (ESLint flat config, async `params`, `default.tsx` slots); `6965d8a` (2026-10-26) was 2.22.1 | starter READMEs; `gh api repos/medusajs/dtc-starter/commits` |

### 1.1 2.22.0 / 2.22.1 (checked 2026-10-26; superseded by 2.22.3, §1.3, but everything here still applies)

Checked **2026-10-26** in the published 2.22.1 packages (rank 1, unpacked outside the repo), the package changelogs in `medusajs/medusa` (`packages/*/CHANGELOG.md`, rank 4) and the docs (rank 2). Until `scripts/update-medusa.sh` installs 2.22.1 (TASKS F-042), code here still follows 2.21.2. **No codemods** are listed for 2.22 (docs `learn/codemods`).

**Must hold for the update (all already true here):**
- **Node ≥ 22.22.0** (#17089). Our backends declare it; Docker and CI use the newest 22.x.
- **`@medusajs/ui` 4.2.8** (dashboard dependency; pin rule in §1 Versioning).

**Changes that touch this repo's code paths:**

| Change (PR) | What it means here | Source |
|---|---|---|
| **License-key checks** (#16678). Two features now need `MEDUSA_LICENSE_KEY`, a key issued by Medusa (`support@medusajs.com`): the **RBAC module** (`Modules.RBAC`) and the **`@medusajs/auth-oidc`** provider. Loading either without a valid key fails with `LICENSE_CHECK_ERROR` | We load neither, so nothing changes. It does mean admin **RBAC is now a paid feature**: the plan's "revisit cashiers when RBAC ships" (§6.2, F-035) now also needs an owner decision on the licence. Cashiers stay a custom actor type | `@medusajs/utils` `dist/license/index.js` (`LicenseFeature = { RBAC, AUTH_OIDC }`); `@medusajs/modules-sdk` `dist/loaders/utils/load-internal.js` (`LICENSED_MODULES`, `LICENSED_PROVIDERS`) |
| **`projectConfig.http.requireActorAssociation`** (#17347): `{ emailpass: true }` refuses `/auth/<actor>/emailpass` logins for an auth identity whose `app_metadata` has no `<actor>_id`. Registration still works. Default (unset) = any identity may log in as any actor type | Opt-in, so nothing changes on update. Worth considering for hardening: our `cashier` and `customer` flows register first and associate the actor afterwards (accept / create customer), so login-after-association keeps working. Test it before turning it on | `@medusajs/types` `dist/common/config-module.d.ts` (`requireActorAssociation?: Record<string, boolean>`); `@medusajs/medusa` `dist/api/auth/utils/require-actor-association.js` |
| **Customer email must match the auth identity** (#17415): `createCustomerAccountWorkflow` throws `UNAUTHORIZED` "The customer's email must match the email of the authenticated identity" when the customer email isn't the identity's `entity_id` or a provider `user_metadata.email` | Our storefront signs up with the email and then creates the customer with the same email (`storefront/src/lib/data/customer.ts`), so it passes. Re-run the sign-up tests on update | `@medusajs/core-flows` `dist/customer/steps/validate-customer-account-creation.js` |
| **`price-list.*` events** (#17067): `created`, `updated`, `deleted`, `prices_added`, `prices_updated`, `prices_removed` (`PriceListWorkflowEvents` in `@medusajs/framework/utils`). Also new events from product-link, variant-price and variant-image workflows | Lets the storefront revalidate subscriber (P1-10) refresh on price-list changes, instead of waiting for the `revalidate: 600` safety net | `@medusajs/utils` `dist/core-flows/events.d.ts` (diffed against 2.21.2: only these six are new) |
| **Item-level `allow_backorder`** is respected by `convertDraftOrderWorkflow` and order-edit confirmation (#17210) | `pos-checkout`'s own shop-stock check (P2-11) already skips backorder variants. On update, re-run `pos-stock.spec` to confirm the conversion still reserves as before | changelog `core-flows` 2.22.0 |
| **`db:migrate` exits non-zero when a migration script fails** (#17035) | Our entrypoint and `predeploy` run `db:migrate`, so a failing script now fails the deploy instead of passing silently. That's the safer behaviour | changelog `medusa` 2.22.0 |
| Refunds can be retried with an idempotency key (#16964); new store route to update a payment session's client data (#17432); `POST /store/search` accepts case-insensitive order directions (#17313); `/admin/index` routes answer 404 when the index module is off (#17442) | No action. Note them for the PayWay refund work (P1-03 follow-up) | changelog `medusa`, `core-flows` 2.22.x |
| Published packages now ship an `AGENTS.md` (#17382) | Not a source on our evidence ladder; the ladder stays as in §0 | changelog 2.22.0 |

**Not fixed in 2.22.1:** the `updateReservationItems` location bug (§6 "Stock, reservations and fulfilment", F-041). `updateReservationItems_` is unchanged between 2.21.2 and 2.22.1 (`@medusajs/inventory` `dist/services/inventory-module.js`, diffed), so the delete-and-recreate workaround stays.

**Starters:** both moved to 2.22.1, and their storefronts to **Next.js 16** (§1 Starters row). Our storefronts followed on 2026-11-06: Next.js 16.4.5 with the starter's `6b95717` migration (TASKS V-04).

### 1.2 2.22.2 (booking-services 2026-11-04 to 2026-11-06; everything here still applies on 2.22.3)

Released 2026-10-30, npm `latest` on 2026-11-04. Installed in `booking-services/backend` and `booking-services/storefront` with `scripts/update-medusa.sh booking-services 2.22.2` (TASKS F-044). Everything in §1.1 applies too. Checked in the release notes (`medusajs/medusa` v2.22.2, rank 4) and the installed packages (rank 1). **No codemods** listed.

| Change | What it means here | Source |
|---|---|---|
| `@medusajs/ui` **4.2.9** (dashboard dependency); Node ≥ 22.22.0 unchanged | Pinned by the update script (§1 Versioning) | `npm view @medusajs/dashboard@2.22.2 dependencies`; `npm view @medusajs/medusa@2.22.2 engines` |
| The admin builds with **Vite 7.3.7**; "if you have it installed in your project, make sure to update it" | The backend declares `vite` itself: raised to `^7.3.7` (as the 2.22.2 `dtc-starter` backend), so the lockfile holds one Vite. `ecommerce/` and `pos/` (2.21.2) moved to `^7.3.7` too on 2026-11-06 (the 7.3.7 patch is a `pnpm audit` fix, TASKS E-A6) | release notes; the three backends' `pnpm-lock.yaml` |
| `bignumber.js` 11: `BigNumber` / `MathBN` throw on invalid values instead of returning `NaN` | `new BigNumber(NaN)` already threw on 2.21.2 (checked in the installed `pos/backend`). Our only use, the PayWay callback amount, behaves the same | release notes; `node -e` check in both apps |
| An invalid `bodyParser.sizeLimit` in a route's middleware config throws when the route is called | We set no `sizeLimit` | release notes; `grep` |
| `@medusajs/ui-preset` no longer ships `@tailwindcss/forms` | Our storefronts load only `tailwindcss-radix` | release notes; `storefront/tailwind.config.js` |
| Core fix: "don't replace payment sessions with an active payment" (#17536) | Close to our PayWay replaced-session fix (P1 review, 2026-10-05); the copied PayWay HTTP tests pass on 2.22.2 | release notes |
| New beta **Adyen** payment provider; search improvements | Not used | release notes |
| Session cookie: `resolveSessionCookieSecurity` and the `...cookieOptions` spread are unchanged | The F-043 `SESSION_COOKIE_SECURE` setting works the same | `@medusajs/framework` `dist/http/express-loader.js` (2.22.2) |

**Still not fixed in 2.22.2:** `updateReservationItems_` is identical to 2.21.2 (`@medusajs/inventory` `dist/services/inventory-module.js`, diffed), so F-041's workaround stays for any app that moves reservations.

### 1.3 2.22.3 (every app 2026-11-06 to 2026-11-10; everything here still applies on 2.22.6, §1.4)

Released 2026-11-04 (npm `latest` on 2026-11-06). Installed in all three backends, all three storefronts and `pos/pos-app` with `scripts/update-medusa.sh all 2.22.3` (TASKS V-01); `verify: PASS (all)`: ecommerce 114 unit + 32 module + 46 HTTP, pos 126 + 36 + 75, booking-services 153 + 63 + 95, every client builds. Checked in the release notes (`medusajs/medusa` v2.22.3, rank 4) and the installed packages (rank 1). **No codemods** listed. Everything in §1.1 and §1.2 still applies.

| Change | What it means here | Source |
|---|---|---|
| `@medusajs/ui` **4.2.10** (dashboard dependency); the 2.22.3 starter still pins 4.2.9 | Pinned to the dashboard's 4.2.10 by the update script (F-006 rule) | `npm view @medusajs/dashboard@2.22.3 dependencies`; update script output |
| Starters: `engines.node` `>=22.23.4` | Every app here declares `>=22.23.4` too; Docker `node:22` and CI meet it | `medusajs/dtc-starter`, `b2b-starter` `apps/backend/package.json` |
| **End-to-end RBAC** (#15620, "Requires Enterprise License"): dashboard roles, `/rbac` routes, a `@medusajs/rbac` module | Not loaded unless a project registers it: `defineConfig` only adds `http.rbacActorTypes` (default `["user"]`). We register nothing, so cashiers, vendors and sellers stay custom actor types (plan §3.2) | `@medusajs/utils` `dist/common/define-config.js` (`DEFAULT_RBAC_ACTOR_TYPES`) |
| `createCustomerAccountWorkflow` gains a **`validate` hook**, and skips the customer-email check when the auth identity has no email (#17608) | New option for sign-up rules; our sign-up still passes the email check (§1.1). Not used yet | `@medusajs/core-flows` `dist/customer/workflows/create-customer-account.js` (`createHook("validate", …)`) |
| `graphql` 17 and new `@graphql-tools` / codegen majors (#17592) | `pnpm audit --prod` in the backends drops from 4 high to 1 (only `zod 4.2.0` left, plan §10 R-i) | `@medusajs/utils` `package.json` (`graphql ^17.0.2`); `pnpm audit` |
| `event-bus-redis`: kept events are no longer lost in `clearGroupedEvents` (#17600) | Production and staging use the Redis event bus; no code change | release notes |
| `@medusajs/ui` / `ui-preset` support Tailwind CSS 4 (#17631) | Our storefronts stay on Tailwind 3 and build unchanged | release notes; storefront builds |
| Dependency updates: MikroORM 6.6.17, jest 30 in Medusa's own repo, Stripe 23, babel 8, awilix 13, chokidar 6 | Our test setup keeps jest 29 (as the 2.22.3 starter); all suites pass | release notes; starter `package.json` |
| Session cookie: `resolveSessionCookieSecurity` unchanged (Secure + `SameSite=lax` in production or staging) | The F-043 `SESSION_COOKIE_SECURE` setting works the same | `@medusajs/framework` `dist/http/express-loader.js` (2.22.3) |
| Carts reject variants of products that are not `published`: `400 invalid_data` "Variants … do not exist or belong to a product that is not published". `POST /admin/products` creates `draft` unless `status` is sent | Test seeders that create products for carts send `status: "published"` (wholesale P4-01, F-056) | `@medusajs/core-flows` `dist/cart/workflows/get-variants-and-items-with-prices.js`; `@medusajs/types` `http/product/admin/payloads.d.ts` (`status?: ProductStatus`) |
| `OrderSummaryDTO` fields: `pending_difference`, `current_order_total`, `original_order_total`, `transaction_total`, `paid_total`, `refunded_total`, `credit_line_total`, `accounting_total` (+ `raw_*`); **no `difference_sum`** | Don't assert `difference_sum` on order or draft-order summaries | `@medusajs/types` `dist/order/common.d.ts` (2.22.3) |
| `medusaIntegrationTestRunner` options: `moduleName`, `env`, `dbName`, `medusaConfigFile`, `schema`, `debug`, `testSuite`, `hooks`, `cwd`; **no `inApp`** (the b2b-starter's tests pass it). Without `JWT_SECRET` the app signs with `"supersecret"` outside production | Test helpers that sign tokens use `process.env.JWT_SECRET \|\| "supersecret"` | `@medusajs/test-utils` 2.22.3 `.d.ts` (tsc error TS2353); `@medusajs/framework` `dist/config/config.js` |
| `@medusajs/framework/zod` (re-export of `@medusajs/deps/zod`) also works in admin extensions: the admin build bundles it | Admin forms import `z` from it too, so the Gate 5 zod rule holds everywhere | `@medusajs/framework` `package.json` `exports["./zod"]`; wholesale `medusa build` (frontend build OK, 2026-11-10) |
| `medusajs/b2b-starter`: `0e45fcb` (2026-11-04) bumps to 2.22.3, `47eecab` (2026-11-05) is the last commit on 2.22.3; `17e12be` (2.22.4) and `f352e3c` (2.22.6) followed on 2026-11-09 | `wholesale/backend` copied `47eecab` (TASKS P4-01, F-055); Medusa 2.22.6 exists and is a separate update task | `git log` of `medusajs/b2b-starter`; `apps/backend/package.json` per commit |

**Still not fixed in 2.22.3:** `updateReservationItems_` loads the levels only for `data.location_id ?? reservation.location_id`, so the old location's `reserved_quantity` is never reduced (F-041). The POS workaround stays.


### 1.4 2.22.6 (installed in every app)

Released 2026-11-09 (npm `latest`). 2.22.4 came out 2026-11-06; 2.22.5 (2026-11-09) is **deprecated** (packages missing files) and 2.22.6 is the same release rebuilt. Installed in all three backends, all three storefronts and `pos/pos-app` with `scripts/update-medusa.sh all 2.22.6` on 2026-11-10 (TASKS V-06). Both official starters are on 2.22.6 (`@medusajs/ui` 4.2.9, `engines.node` `>=22.23.4`). Checked in the release notes of v2.22.4, v2.22.5 and v2.22.6 (`medusajs/medusa`, rank 4) and the installed packages (rank 1):

| Change | What it means here | Source |
|---|---|---|
| **Security (2.22.5/2.22.6):** dotted `fields`, filter and `order` query parameters are turned into query objects more strictly; unexpected path segments are skipped or rejected and a malformed key now answers **`400` instead of `500`**. Medusa: "We recommend that all self-hosted projects update to this version as soon as possible" (Medusa Cloud is filtered at its edge, we self-host). Patches for older versions exist; we update instead | Why we took 2.22.6 one day after release. A test or client that expected `500` for a bad `fields` key now gets `400` | v2.22.5 release notes (#17712) |
| `@medusajs/ui` **4.2.13** (dashboard dependency) | Pinned by the update script (F-006 rule) | `npm view @medusajs/dashboard@2.22.6 dependencies` |
| `@medusajs/framework` uses **`path-to-regexp` 9** (was `^8.4.0`) for route and middleware matching | Matchers still work: `RoutesFinder.add` rewrites `/*` and `/path*` to `{*splat}` before compiling, so `pos/backend`'s `'/pos*'` matcher is unchanged; a `RegExp` matcher is used as is | `@medusajs/framework` `dist/http/routes-finder.js` (2.22.6); `npm view @medusajs/framework@2.22.6 dependencies` |
| `getOrdersListWorkflow` no longer returns order items unless requested (#17719) | The storefronts' `listOrders` asks for `*items` explicitly, so nothing changes; ask for `items` in `fields` when you need them | v2.22.6 release notes; `*/storefront/src/lib/data/orders.ts` |
| Framework and CLI support TypeScript 7 (with `@typescript/typescript6` beside it, #17660); `@medusajs/test-utils` gets a Jest preset (#17673) | Not adopted: we stay on the starters' TypeScript and `jest.config.js` | v2.22.4 release notes |
| `scrypt-kdf` 4.0.0 inside `auth`, `auth-emailpass` and `test-utils` (#17679) | Medusa's own dependency; a project that hashes test passwords itself keeps its own `scrypt-kdf` version | v2.22.4 release notes |
| Buy-get promotions get a target selection strategy (#17563); shipping options no longer copy a location's fulfillment sets (#17710) | No code here depends on either | v2.22.5 release notes |
| Dashboard fixes: list filters kept through breadcrumbs, extension routes under orders shown in the sidebar, receive-return / allocate / mark-as-paid buttons shown again | Admin only | v2.22.4 release notes |
| Engines: `@medusajs/medusa` 2.22.6 still `node >=22.22.0` | Our `>=22.23.4` meets it | `npm view @medusajs/medusa@2.22.6 engines` |
| pnpm 12 refuses packages younger than its minimum release age; on the day after a release the update script's `pnpm install` writes `minimumReleaseAgeExclude` entries (exact `@medusajs/*@2.22.6` and `@medusajs/ui@4.2.13` versions) into each app's `pnpm-workspace.yaml` | Kept in this update (security release): they name exact versions only, so no other new package skips the check. Remove them in a later update once the versions are old enough (F-057) | `pnpm install` output; `pnpm-workspace.yaml` diffs |

`pnpm audit --prod` in each backend: 1 high (`zod` 4.2.0, plan §10 R-i), unchanged. **Still not fixed in 2.22.6:** `updateReservationItems_` still passes only `data.location_id ?? reservation.location_id` (F-041); the POS workaround stays (`@medusajs/inventory` `dist/services/inventory-module.js`).

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
| **Admin session cookie:** with `NODE_ENV` `production` or `staging` the `connect.sid` cookie is `Secure` + `SameSite=Lax` (otherwise neither), and `projectConfig.cookieOptions` (`CookieOptions`: `secure`, `sameSite`, `maxAge`, `httpOnly`, …) is spread **over** that default. Over plain http a production build therefore sends no `Set-Cookie` and the admin dashboard can't stay signed in (sign-in 200, back to login). This project passes `cookieOptions: { secure: false }` only when `SESSION_COOKIE_SECURE=false` (local compose stacks of `pos` and `ecommerce`, TASKS F-043); never on Dokploy. Verified: no `Set-Cookie` on http before, `HttpOnly; SameSite=Lax` cookie and a working dashboard after (2.21.2) | `@medusajs/framework/dist/http/express-loader.js` (`resolveSessionCookieSecurity`, `sessionOpts.cookie`); `@medusajs/types` `ConfigModule.projectConfig.cookieOptions`, `CookieOptions` |
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
- **Modifiers:** `.primaryKey()`, `.default(v)`, `.nullable()`, `.unique()`, `.index()`, `.searchable()`.
- **There is no time-of-day type** (the property types are `array`, `autoincrement`, `big-number`, `boolean`, `computed`, `date-time`, `enum`, `float`, `id`, `json`, `number`, `text`; `@medusajs/utils` `dist/dml/properties`, 2.22.2). `booking_schedule` stores zero-padded `"HH:MM"` text, which compares correctly as text (TASKS P3-01).
- **Check constraints are entity-level:** `model.define(...).checks([{ name, expression: (columns) => \`${columns.capacity} >= 1\` }])` (`@medusajs/types` `CheckConstraint`: a function, or `{ name?, expression?, property? }`). `db:generate` writes them as named `constraint <name> check (...)`; a violating write throws an error whose message names the constraint, and `moduleIntegrationTestRunner` applies them too. Watch the order of several checks on one row: Postgres reports one, so a test that expects a specific constraint must not also break another (verified in `booking-services`, P3-01).
- **`model.float()`** is a Postgres `real` column (verified 2.22.6, reseller `seller.commission_rate`, P5-01). **Regex in a check constraint:** write `\\.` in the TypeScript template string for a literal dot; `db:generate` writes it as `\\.` inside the migration's template literal, so Postgres gets `\.` (tested by `seller_domain_format`).
- **Autoincrement numbers:** `model.autoincrement()` generates a `serial` column (verified 2.22.6, wholesale `invoice.display_id`, P4-06); pair it with a unique index on the business key (`.indexes([{ on: ["order_id"], unique: true }])`) for one record per order.
- **Range filters on `dateTime`:** `list<Model>s({ resource_id, starts_at: { $lt: end }, ends_at: { $gt: start } })` finds overlapping rows (verified by the P3-01 module test).
- **Composite / unique indexes:** `model.define(...).indexes([{ on: ["a", "b"], unique: true, where: {...} }])` (docs `learn/fundamentals/data-models/indexes`; `@medusajs/types` `EntityIndex`). The generated SQL ignores soft-deleted rows (`WHERE deleted_at IS NULL`). Adding a unique index to a table that already has data: make the generated migration clean up existing duplicates first, or the deploy fails (project rule, `telegram_links` `Migration20261005110738`).
- `created_at`, `updated_at` and `deleted_at` are added automatically. Don't declare them.
- **Generated service methods** come from the keys of the object passed to `MedusaService({...})`: `createPosts`, `retrievePost`, `listPosts`, `updatePosts`, `deletePosts`, `softDeletePosts`, … (reference: `resources/service-factory-reference`). *Plan spike (§9):* the method name comes from the object key, not the table name.
- **Custom service methods with database access** (docs `learn/fundamentals/modules/db-operations`; decorators exported from `@medusajs/framework/utils`, `@medusajs/utils` `dist/modules-sdk/decorators/*.d.ts` 2.22.2): a public method with `@InjectManager()` and a last parameter `@MedusaContext() sharedContext: Context<EntityManager> = {}` (`Context` from `@medusajs/framework/types`, `EntityManager` from `@medusajs/framework/mikro-orm/knex`) calls a protected method with `@InjectTransactionManager()`; inside it, `sharedContext.transactionManager.execute(sql, params)` runs raw SQL in the transaction, and the generated methods (`list…`, `create…`) take `sharedContext` as their last argument to join it. Medusa's ESLint plugin enforces this: a protected method with a `Context` parameter must have `@InjectTransactionManager()`, and the parameter must have `@MedusaContext()`. A transactional method called with the caller's context joins the caller's transaction. Row lock for a check-then-insert: `SELECT id FROM <own table> WHERE id = ? FOR UPDATE` first (booking `createHold`, P3-03).
- **Module options** (docs `learn/fundamentals/modules/options`): `{ resolve, options: {...} }` in `medusa-config.ts`; the main service gets them as the constructor's second argument: `constructor(container, options) { super(...arguments) }`. `moduleIntegrationTestRunner` takes `moduleOptions` (`@medusajs/test-utils` `module-test-runner.d.ts`).
- **Migrations:** `npx medusa db:generate <module>` creates `src/modules/<name>/migrations/Migration*.ts`. It needs a reachable database. **Commit the migration and its `.snapshot-*.json`.** Migration imports come from `@medusajs/framework/mikro-orm/migrations` (since v2.11.0). **Without a snapshot** (copied starter modules: `b2b-starter` commits none), `db:generate` diffs against nothing and writes a full `create table if not exists` migration, which adds nothing to an existing table. Fix (TASKS P4-02): generate once with the **unchanged** model to write the snapshot, delete that migration, then change the model and generate again: the result is only `alter table … add column if not exists …` (verified 2.22.6, `company` module).
- **Isolation:** never add columns to core tables, and never put foreign keys into core tables. Relate data with module links (§4).
- **The type of a model's record:** `InferTypeOf<typeof Model>` from `@medusajs/framework/types` (verified 2.22.6, typecheck of `reseller/backend/src/workflows/seller/steps/adjust-commission.ts`). Use it for an explicit step return type, e.g. `InferTypeOf<typeof SellerCommission> | null`, when TypeScript can't infer one.

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
- `db:migrate` syncs link tables. Removing or changing a link is an **unsafe** change (§11). **Cardinality is checked by the link service, not the table:** a link without `isList` is one-to-one, and a second link for the same record throws `Cannot create multiple links between '<a>' and '<b>'` (400). Adding `isList` to one side keeps the same table and indexes, and `db:migrate --execute-safe-links` passes (verified 2.22.6, wholesale `order-company`, P4-05).
- **Read-only links:** `defineLink({ linkable: Mod.linkable.x.id, field: "<id column>" }, Other.linkable.y, { readOnly: true })` creates **no link table**; it only lets Query follow the stored ID (docs wishlist guide, Step 5). This repo: `src/links/wishlist-*.ts`.
- **Custom link aliases follow the linkable names, plural on an `isList` side** (verified by the link tests): `pos_register.stock_location` / `stock_location.pos_registers` (P2-02); `booking_resource.product_variants` / `product_variant.booking_resources` (many-to-many, `isList` on both sides) and `booking.order` / `order.bookings` (P3-02). Link table names: `<module>_<model>_<module>_<model>`, e.g. `booking_booking_resource_product_product_variant`. Remove one pair with `link.dismiss({ ... })` (same shape as `link.create`).
- **New link aliases are typed only after a build:** `pnpm build` regenerates `.medusa/types/query-entry-points.d.ts`; until then `tsc` rejects fields like `seller.sales_channel` (`verify.sh` builds before it typechecks; reseller P5-02).
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
- **Nesting:** `someWorkflow.runAsStep({ input })` returns the output directly, with no `.result`. A nested workflow is compensated when a later step of the parent fails (docs `learn/fundamentals/workflows/execute-another-workflow`; booking P3-04 test). `addToCartWorkflow` returns `undefined` (`ReturnWorkflow<AddToCartWorkflowInputDTO & AdditionalData, undefined, …>`, 2.22.2), so find the new line item afterwards, e.g. by a `metadata` key.
- **Step outputs are serialized:** a `Date` returned by one step arrives in the next step (and in `transform`) as an ISO string. Pass ISO strings and build the `Date` where it's used.
- **A failed `run()` rejects with the serialized step error**, a plain object (`message`, `type`, `__isMedusaError`), not an `Error` instance, so Jest's `.rejects.toThrow(...)` reports "did not throw". Match with `.rejects.toMatchObject({ message: expect.stringContaining(...) })`, or use `run({ input, throwOnError: false })` and read `errors[].action` / `errors[].error` (`workflows-sdk` `helper/workflow-export.js`: `throwOnError` defaults to true).
- **Events:** `emitEventStep({ eventName: "custom.created", data })` emits only after the workflow succeeds.
- **Consuming core hooks** (`src/workflows/hooks/*.ts`):
  `createProductsWorkflow.hooks.productsCreated(async ({ products, additional_data }, { container }) => { ... return new StepResponse(undefined, compInput) }, async (compInput, { container }) => { /* undo */ })`
- **No hooks on `createPaymentSessionsWorkflow`** (2.22.2 `core-flows/dist/payment-collection/workflows/create-payment-session.d.ts`: `ReturnWorkflow<CreatePaymentSessionsWorkflowInput, PaymentSessionDTO, []>`), and no event for a new payment session (`PaymentEvents` has only `payment.captured` and `payment.refunded`, `utils/dist/core-flows/events.d.ts`). To act when a customer starts paying, add a middleware on `POST /store/payment-collections/:id/payment-sessions` (it runs before the route; this repo already checks the contact there) and find the cart with Query `payment_collection.cart.id` (booking P3-06).
- **Cart hooks used by this project** (verified in the workflow reference and the 2.21.1 types):
  - `addToCartWorkflow.hooks.validate`, `addToCartWorkflow.hooks.setPricingContext`
  - `updateLineItemInCartWorkflow.hooks.validate`, `.setPricingContext`
  - `completeCartWorkflow.hooks.validate`: runs **before** the order is created and payment authorized. **Never mutate the cart** in it. Validation must stay idempotent on retry.
  - Hook inputs (2.22.2 `core-flows/dist/cart/workflows/*.d.ts`): `addToCartWorkflow` validate `{ input: { cart_id, items: [{ variant_id, quantity, metadata, … }] }, cart }`; `updateLineItemInCartWorkflow` validate `{ input: { cart_id, item_id, update: { quantity?, metadata?, … } }, cart }`; `completeCartWorkflow` validate `{ input: { id }, cart }`. Register them in `src/workflows/hooks/*.ts` as `xWorkflow.hooks.validate(async ({ input }, { container }) => { … })` and throw `MedusaError` `NOT_ALLOWED`: the store routes answer **400** with the message (booking P3-05 tests).
  - **`POST /store/carts` with `items` skips `addToCartWorkflow`**: it adds them inside `createCartWorkflow`, whose own `validate` hook gets `{ input: CreateCartDTO, cart }` with `input.customer_id` set by the route from the signed-in customer (`@medusajs/medusa` `dist/api/store/carts/route.js`, 2.22.6). A rule on cart contents needs the create, add, update-line and complete hooks (wholesale P4-04, `b2b-cart-rules.spec.ts`). Updating a line to quantity 0 removes it.
  - **A draft order's total with pending edits:** `container.resolve(Modules.ORDER).previewOrderChange(orderId)` returns the order with the active order change applied (or the order as is when there is none; `@medusajs/order` `dist/services/order-module-service.js`, 2.22.6). Wholesale uses it for the quoted total when a buyer accepts a quote (P4-05).
  - **What an order still owes** (wholesale P4-04): `query.graph({ entity: "order", fields: ["total", "status", "payment_collections.captured_amount"] })`; with the system provider (`pp_system_default`) a completed order is authorized, not captured, until `POST /admin/payments/:id/capture`.
  - `POST /store/carts/:id/complete` with a failing validate hook: no order is created; the tests treat both a 200 `{ type: "cart", error }` and an error status as refused (`booking-cart-hooks.spec.ts`).
- **Wrapping `completeCartWorkflow`** (e.g. marketplace `complete-vendor`): use `acquireLockStep({ key: cart_id, timeout, ttl })` … `releaseLockStep({ key: cart_id })`, and check existing links through the link's `entryPoint` before creating records. The core workflow is idempotent, so your steps must be too. If completion fails after payment, the payment is reverted automatically.
- **Order cancel and refund events** (verified 2.22.6, reseller P5-04): `order.canceled` carries `{ id }` of the order (`POST /admin/orders/:id/cancel`); `payment.refunded` carries `{ id }` of the **payment**, so reach the order with `query.graph({ entity: "payment", fields: ["payment_collection.order.id"] })`; the refunded total is `order.payment_collections.refunded_amount`.
- **Locks** (verified 2.21.2, also used on 2.22.6 for reseller commissions, `core-flows/dist/locking/steps/acquire-lock.d.ts`): `acquireLockStep({ key: string | string[], timeout? /* s to wait, default 0 */, retryInterval?, ttl? /* s */, ownerId?, provider? })`; its compensation releases the lock when a later step fails. Build a key from input with `transform` (no template strings in the constructor). POS shift workflows lock `pos-register:<id>` and `pos-shift:<id>` (`pos/backend/src/workflows/pos-shift.ts`).
- **Price lists and customer-group prices** (verified 2.22.6, TASKS P4-03, `integration-tests/http/b2b-pricing.spec.ts` in `wholesale/backend`):
  - `createPriceListsWorkflow(container).run({ input: { price_lists_data: [{ title, description, status: "active", rules: { "customer.groups.id": [groupId] }, prices: [{ variant_id, currency_code, amount, min_quantity?, max_quantity?, rules? }] }] } })` (`@medusajs/types` `pricing/workflows.d.ts` `CreatePriceListWorkflowInputDTO`). The workflow input has **no `type`**, so lists are `"sale"`: a list price applies only when it is lower than the base price (an `"override"` list needs the admin API's `type`).
  - The rule attribute is **`customer.groups.id`** (the pricing migration `Migration20241212190401` renamed `customer_group_id` to it).
  - Store prices: `/store/products?region_id=…&fields=*variants.calculated_price` uses the signed-in customer's groups (`authenticate("customer", …, { allowUnauthenticated: true })`, then `setPricingContext` adds `customer.groups[].id`; `@medusajs/medusa` `dist/api/utils/middlewares/products/set-pricing-context.js`). A guest gets the base price.
  - **Quantity tiers** are per price: `min_quantity` / `max_quantity` on each price-list price. `/store/products` has no quantity in its context, so the tier shows in the **cart** (line item `unit_price` changes when the quantity crosses `min_quantity`).
  - Base prices to copy from: `query.graph({ entity: "variant", fields: ["price_set.prices.amount", "price_set.prices.currency_code", "price_set.prices.price_list_id", "price_set.prices.rules_count", "price_set.prices.min_quantity"] })` (the typed graph has no `variant.prices`); a base currency price has no `price_list_id`, no rules and no `min_quantity`.
- **Money math:** `MathBN` from `@medusajs/framework/utils` (`add`, `sub`, `mult`, `div`, `convert`, `gt`/`lt`/`eq`, …; `utils/dist/totals/math.d.ts`) instead of JavaScript floats; `.toNumber()` for the result. `bigNumber` model fields come back as numbers or BigNumber objects; pass them straight to `MathBN`.
- **Payment records** (verified 2.21.2, `@medusajs/payment/dist/services/payment-module.js`): `authorizePaymentSession` creates the payment with `data` = the **provider's** authorize result, so the system provider (`pp_system_default`) leaves `payment.data` = `{}` (`providers/system.js`); the payment session's `metadata` is stored as given in `createPaymentSession(collectionId, { provider_id, currency_code, amount, data, metadata })`, and `payment.payment_session` links back to it. `UpdatePaymentDTO` has only `id`, so a payment's own fields can't be tagged later. **Tag a payment through its session `metadata`** (POS: `metadata.pos_payment_method = "cash"`, read by close-shift).
- **Draft orders** (verified 2.21.2, `@medusajs/medusa/dist/api/admin/draft-orders/route.js`, `core-flows/dist/order/workflows/create-order.js`, `draft-order/workflows/convert-draft-order.js`): a draft order is `createOrderWorkflow` with `status: OrderStatus.DRAFT` and `is_draft_order: true`, which is how the admin route creates one. `CreateOrderDTO` has no `is_draft_order` field, so type the input as `CreateOrderWorkflowInput & { is_draft_order: boolean }`. Items need only `variant_id` and `quantity`, because the workflow prices them in the region and currency. The type still asks for `title` and `unit_price`, so cast the items. `promo_codes` applies the promotions through `refreshDraftOrderAdjustmentsWorkflow`; an unknown code throws "The promotion code X is invalid" and the draft is rolled back. With no `customer_id` or `email`, the order has no customer. `convertDraftOrderWorkflow({ id })` re-taxes, reserves inventory in the sales channel's locations, sets the status to `pending` and emits `order.placed`. It takes its own lock on the order id. **Pay the order:** `createOrderPaymentCollectionWorkflow({ order_id, amount })` creates the collection and links it, then call `createPaymentSession` with `metadata`, then `authorizePaymentSessionStep({ id, context })`, then `capturePaymentWorkflow({ payment_id, captured_by, amount })`. Core's `markPaymentCollectionAsPaid` follows the same path but can't set session metadata. Used by `pos/backend/src/workflows/pos-checkout.ts`.
- **Stock, reservations and fulfilment** (verified 2.21.2; docs "Reservations Lifecycle", "Inventory Module in Medusa Flows"; POS P2-11):
  - **When stock changes:**
    - A reservation raises a location's `reserved_quantity` and leaves `stocked_quantity` alone.
    - **Only a fulfilment takes stock.** `createOrderFulfillmentWorkflow({ order_id, items, location_id?, shipping_option_id?, no_notification? })` subtracts the quantity from the `stocked_quantity` at `location_id` (or the reservation's location) and deletes or shrinks the reservation.
  - **Where `convertDraftOrderWorkflow` reserves** (like `completeCartWorkflow`): at the first stock location of the order's sales channel that has enough stock (`prepareConfirmInventoryInput` → `reserveInventoryStep`, `location_ids[0]`).
  - **A fulfilment needs a shipping option** (`shippingOption.id`/`provider_id` are read even when `location_id` is given). For sales with no shipping (a POS counter), give the location a hidden option:
    - a fulfilment set of type `pickup` with a service zone that has no geo zones
    - provider `manual_manual`, linked to the location
    - `price_type: "flat"`, price 0 per currency
    - rules `enabled_in_store = "false"` and `is_return = "false"`
    - The storefront's options call passes `enabled_in_store: "true"` (`list-shipping-options-for-cart.js`), so the option never shows online. See `pos/backend/src/workflows/pos-in-store.ts`.
  - **Bug in 2.21.2:** never move a reservation with `updateReservationItems({ id, location_id })`. The new location gains the reserved quantity, but the **old one never loses it**: the adjustment is computed, but only the new location's levels are loaded and updated (`inventory-module.js` `updateReservationItems_`). Instead, `deleteReservationItems` + `createReservationItems` (same `line_item_id`, `inventory_item_id`, `quantity`) at the new location (TASKS F-041).
  - **Order totals through Query** (2.22.2 `@medusajs/order` `order-module-service.js` `shouldIncludeTotals`): the order module computes `total`, `items.total` and the other totals only when a **top-level** total field (`total`, `subtotal`, `item_total`, …, or `*`) is in the select. Query the order as `entity: "order"` with `"total"` and `"items.total"`; through a link (`booking.order.items.total`) the item total comes back empty (NaN) (booking P3-08).
  - **Refunds:** `refundPaymentWorkflow({ payment_id, amount?, note?, created_by?, refund_reason_id?, idempotency_key? })` refuses more than the captured amount (`validateRefundPaymentExceedsCapturedAmountStep`) and returns the payment **before** the refund; read `payment.refunds` again afterwards. `idempotency_key` (2.22.x) is passed to the provider so a retry never refunds twice. Capture first with `capturePaymentWorkflow({ payment_id, amount?, captured_by? })`. Captured / refunded amounts: `payment.captures.amount`, `payment.refunds.amount` (booking P3-08).
  - **Query note:** `order.fulfillment_status` and `items.detail` aren't filled by plain `query.graph` (the admin order route computes them). Check fulfilments through `fulfillments.items.{line_item_id,quantity}` and `fulfillments.location_id`.
  - **What a storefront shows** (`@medusajs/medusa/dist/api/utils/middlewares/products/variant-inventory-quantity.js`; POS P2-09): `+variants.inventory_quantity` on `/store/products` comes from `getVariantAvailability(query, { variant_ids, sales_channel_id })`, i.e. stocked − reserved over the stock locations of **one** sales channel. That channel is the publishable key's own, if the key has exactly one; otherwise the request's single `sales_channel_id`. Anything else answers 400 "Inventory availability cannot be calculated in the given context". So give a storefront's key exactly one channel. Online and till share stock when the till's location is also linked to the online channel (`pos/backend/integration-tests/http/pos-shared-stock.spec.ts`).
- **Products that aren't shipped** (docs `resources/commerce-modules/product/selling-products` → Configuring Shipping Requirements; 2.22.2 `core-flows/dist/cart/utils/prepare-line-item-data.js`): a line item's `requires_shipping` = the request's value if given, else **product has a shipping profile OR one of the variant's inventory items has `requires_shipping`**. So a service is a product with no `shipping_profile_id` and variants with `manage_inventory: false`; a cart of such items completes without a shipping method. Shipping options are still returned for the cart's address. A new cart in a one-country region already has that country on its `shipping_address` (booking P3-12, F-048).
- **POS route patterns** (verified 2.21.2, `pos/backend/src/api/pos/*`, `admin/pos/*`):
  - **Variant price outside the store routes:** `query.graph({ entity: "product_variant", fields: [..., "calculated_price.calculated_amount"], context: { calculated_price: QueryContext({ currency_code, region_id }) } })`. This is the same context the store product route sets under `variants` (`@medusajs/medusa/dist/api/store/products/route.js`). The generated type has no `calculated_price`, so widen the row type.
  - **Exact match on several fields:** `listProductVariants({ $or: [{ barcode }, { ean }, { upc }, { sku }] })` (`BaseFilterable.$or`). `q` would match partially (ilike), because these fields are `.searchable()`. Customers: `listCustomers({ q })` searches first_name, last_name, email, phone and company_name.
  - **New customer:** `createCustomersWorkflow({ customersData: [...] })`.
  - **Replace a link:** query the current linked id, then `dismissRemoteLinkStep([old])` and `createRemoteLinkStep([new])`. Both steps accept an empty array and restore the link as compensation (`core-flows/dist/common/steps/*-remote-links.js`).
  - **Query strings:** `validateAndTransformQuery(schema, queryConfig)` is built for the core list routes, with fields and pagination config. For a simple custom query, `schema.safeParse(req.query)` and throw `INVALID_DATA` (`src/api/pos-query.ts`).
- **Core workflows and steps verified in 2.21.1 and 2.21.2** (`@medusajs/medusa/core-flows`): `acquireLockStep`, `releaseLockStep`, `useQueryGraphStep`, `createRemoteLinkStep`, `dismissRemoteLinkStep`, `emitEventStep`, `setAuthAppMetadataStep`, `createOrderWorkflow`, `completeCartWorkflow`, `addToCartWorkflow`, `updateLineItemInCartWorkflow`, `convertDraftOrderWorkflow`; also used and verified in 2.21.2: `sendNotificationsStep`, `updateRegionsWorkflow`, `createShippingProfilesWorkflow`, `createDefaultsWorkflow`, `createPaymentSessionsWorkflow`, `deletePaymentSessionsWorkflow`, `refreshPaymentCollectionForCartWorkflow`, `processPaymentWorkflow`, `createOrderPaymentCollectionWorkflow`, `authorizePaymentSessionStep`, `capturePaymentWorkflow`, `createCustomersWorkflow`, `createOrderFulfillmentWorkflow`, `createShippingOptionsWorkflow`. Before using any other name, check that it exists with ladder step 1.

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
- **Ownership in store routes** (wholesale P4-07, F-058): never take the tenant (company, vendor, seller) from the URL or body. Resolve it from `req.auth_context.actor_id` through the actor's own record, throw `FORBIDDEN` (403) for a non-member and `NOT_FOUND` (404) for someone else's record, and return a fixed `fields` list when the route needs no `?fields`. A `query.graph` with a non-id filter and `throwIfKeyNotFound: true` answered 404 for an existing row (`approval_settings` by `company_id`, 2.22.6): check the result yourself for non-id filters.
- **Who is signed in:** read `req.auth_context.actor_id` (the customer or user id). `req.auth_context.app_metadata.<actor>_id` is not on every token (the `b2b-starter` admin approval route read `app_metadata.user_id` and failed with 500 on the test runner's admin token; wholesale P4-05).
- **Custom auth:** `authenticate("customer" | "user" | "<actor>", ["session", "bearer", "api-key"], { allowUnauthenticated? })`. Use `AuthenticatedMedusaRequest` and read `req.auth_context.actor_id`.
- **Custom actor type** (vendor, seller, cashier): register with `POST /auth/<actor>/emailpass/register`, create the record in a workflow, then call `setAuthAppMetadataStep({ authIdentityId, actorType: "<actor>", value: record.id })`. Log in with `POST /auth/<actor>/emailpass`. Verified in 2.21.2 (POS P2-03): the route that links the actor needs `authenticate("<actor>", ["bearer"], { allowUnregistered: true })`; there `req.auth_context.auth_identity_id` is set and `actor_id` is empty until linked. `setAuthAppMetadataStep` throws if `app_metadata.<actor>_id` already exists and removes it again as compensation (`@medusajs/core-flows/dist/auth/steps/set-auth-app-metadata.js`). An emailpass identity's email: `retrieveAuthIdentity(id, { relations: ["provider_identities"] })` → `provider_identities[].entity_id`. An unlinked identity can still sign in at `/auth/<actor>/emailpass`, but `authenticate("<actor>", …)` without `allowUnregistered` refuses its token (401). **When the actor acts for the shop (cashier, vendor admin, seller), never let a registration token create the actor on its own**: this repo's pattern is invite-only, an admin creates the record and the registered email must match it (`pos/backend/src/workflows/pos-cashier.ts`, TASKS F-036); also verified on 2.22.6 for reseller sellers (`reseller/backend/src/workflows/seller/accept-seller-invite.ts`, `src/api/seller-auth.ts`, TASKS P5-03). Email verification applies only to actor types listed in `http.authVerificationsPerActor`.
- **CORS:** `storeCors` and `adminCors` apply **only** to `/store*` and `/admin*`. **Any other prefix** (`/vendors`, `/sellers`, `/pos`) needs its own middleware using `cors` + `parseCorsOrigins(...)` (docs snippet in `learn/fundamentals/api-routes/cors`). The docs snippet imports the `cors` package. pnpm doesn't allow undeclared imports, so add `cors` + `@types/cors` to `package.json` (pnpm rule, not a Medusa doc statement). CORS values may be regex strings (`/.../`) (`learn/configurations/medusa-config`).
- **Errors:** `throw new MedusaError(MedusaError.Types.INVALID_DATA | NOT_FOUND | NOT_ALLOWED | UNAUTHORIZED | DUPLICATE_ERROR | UNEXPECTED_STATE | INVALID_ARGUMENT, "message")` (import from `@medusajs/framework/utils`). HTTP status (verified 2.21.2, `@medusajs/framework/dist/http/middlewares/error-handler.js`): `INVALID_DATA` and `NOT_ALLOWED` → 400, `UNAUTHORIZED` → 401, `FORBIDDEN` → 403, `NOT_FOUND` → 404, `DUPLICATE_ERROR` → 422.
- **Body validation is opt-in per route:** a route reads `req.validatedBody` only if a `validateAndTransformBody(schema)` middleware ran for its matcher; `req.body` is the raw body. Use `.strict()` schemas for routes buyers call so unknown or admin-only keys answer 400 (the `b2b-starter` `POST /store/companies/:id` spread `req.body` into its update workflow without a schema: TASKS P4-02, F-058).
- **Field limits per route** (`QueryConfig` in `@medusajs/types` `common.d.ts`, applied by `prepareListQuery` / `prepareRetrieveQuery` in `@medusajs/framework` `dist/http/utils/get-query-config.js`, 2.22.6): `defaults` (what you get without `?fields`), `allowed` (only these may be requested), `disallowed` (string segments or RegExps that are always stripped from requested paths, e.g. `orders` blocks `orders.customer.email`). A `*relation` default still returns every column of that relation, so keep sensitive columns out by listing the relation's fields instead of `*relation`.
- **A different publishable key per request** (multi-tenant storefront, reseller P5-07): the js-sdk sets custom headers over its default ones (`@medusajs/js-sdk` `dist/client.js` `initClient`: `headers.set` for `init.headers`), so a wrapper of `sdk.client.fetch` can pass `x-publishable-api-key`. Next.js 16.4.5's data-cache key includes the request headers (`next/dist/server/lib/incremental-cache/index.js` `generateCacheKey`; only `traceparent`/`tracestate` dropped), so cached catalog fetches stay apart per key. When the key comes from `headers()`, keep Next's own errors with `unstable_rethrow` (`next/navigation`) in any `catch`, or a page can be cached with one tenant's data.
- **Invite-only actors need more than the email** (REVIEW_FIXES B11): `authVerificationsPerActor` covers only the actors listed (here `customer`), and an actor-less registration token still passes `authenticate(actor, …, { allowUnregistered: true })`, so matching an invitation by the registered email lets whoever registers that email first take it. This repo adds an invite code derived from the record id (`src/lib/invite-code.ts`, HMAC with the server secret) that the accept route must receive (`reseller/backend`, `pos/backend`).
- **Requiring sign-in on core Store routes** (wholesale F-068; verified 2.22.6 by `wholesale/backend/integration-tests/http/catalog-login.spec.ts`): a middleware entry in `src/api/middlewares.ts` with a core matcher (`/store/products*`, `/store/product-variants*`, `/store/search*`) and `authenticate("customer", ["session", "bearer"])` answers 401 to a request that only has the publishable key; the core route's own `allowUnauthenticated` middleware does not undo it.
- **A lock around a core route** (wholesale REVIEW_FIXES B6; verified 2.22.6 by `b2b-review-money.spec.ts`): a middleware can run the rest of the request inside `container.resolve(Modules.LOCKING).execute(key, job, { timeout, expire })` (`ILockingModule.execute` in `@medusajs/types/dist/locking`) by calling `next()` in the job and resolving it on the response's `finish` / `close`. Used to serialise `/store/carts/:id/complete` per company without replacing the core route.
- **`completeCartWorkflow` has no official hook for the created order**: its `orderCreated` hook is `@ignore` in 2.22.6 and missing from the typed hooks; react to `order.placed` instead (wholesale B5).
- **Find variants by SKU in the Store API** (wholesale quick order, P4-08): `GET /store/products` takes `variants[sku][]=…` (also `ean`, `upc`; since 2.13.7; `StoreProductListParams.variants` in `@medusajs/types/dist/http/product/store/queries.d.ts`, validator in `@medusajs/medusa/dist/api/store/products/validators.js`). The match is exact and case-sensitive (verified 2.22.6: `webcam-black` did not find `WEBCAM-BLACK`).
- **An order's `total` goes down after a refund** (verified 2.22.6, reseller P5-12: 31.5 → 15.75 after refunding 15.75). For "what the customer paid" use `payment_collections.captured_amount`; for "what was refunded" `payment_collections.refunded_amount`.
- **`acquireLockStep` with several keys needs an `ownerId`** (verified 2.22.6, in-memory provider, reseller REVIEW_FIXES B10): the keys are taken one by one, and a key already held makes the attempt throw; without an owner the retry then stops at the keys this run took itself and fails ("Failed to acquire lock for key …"). Pass a per-run `ownerId` (e.g. `transform(…, () => randomUUID())`) to both `acquireLockStep` and `releaseLockStep`.
- **`disallowed` in a route's query config** (wholesale REVIEW_FIXES B13; `QueryConfig.disallowed` in `@medusajs/types/dist/common/common.d.ts`, filter in `@medusajs/framework/dist/http/utils/field-filtering/field-validator.js`): strips requested fields whatever `?fields=` says. A string matches a whole segment; a RegExp is tested against **each segment and** the full path, so a pattern meant for one relation path needs the dot (`/\.admin$/`, not `/(^|\.)admin$/`, which also strips `messages.admin.first_name`).
- **js-sdk errors:** `sdk.client.fetch` rejects with the backend's `message` on a non-2xx answer; a plain `fetch` does not reject, so check `res.ok` (the `b2b-starter` bulk add missed this, F-066).
- **Store routes** need the `x-publishable-api-key` header. A custom route under `/store/...` that needs a signed-in customer (outside `/store/customers/me*`) gets `authenticate("customer", ["session", "bearer"])` in `src/api/middlewares.ts`; without a token it answers 401 (booking `POST /store/booking/cancel`, P3-10). In tests, a customer bearer token is a JWT `{ actor_id, actor_type: "customer", auth_identity_id }` signed with the default test secret, as the admin token in the checkout acceptance test.
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
- **Several subscribers can listen to one event**, one file each (`booking-services`: `order-placed.ts` for notifications, `booking-order-placed.ts` for bookings). In `medusaIntegrationTestRunner` the local event bus runs them after the request returns, so a test polls for the result (booking P3-07, checkout acceptance P1-07).
- **Order items keep the cart line item's `metadata`** after `completeCartWorkflow` (verified: `order.items.metadata.booking_id`, booking P3-07).
- **Notifications without duplicates:** `CreateNotificationDTO` has `idempotency_key`; the notification module looks up keys already sent and skips them (2.22.2 `@medusajs/notification` `notification-module-service.js`). Use one key per message, e.g. `booking_reminder_<id>`, with `sendNotificationsStep` last in the workflow (it can't be undone). Also useful: `resource_id`, `resource_type`, `trigger_type` (booking P3-09).
- **`Intl.DateTimeFormat(...).format()` punctuation differs between Node / ICU versions** (Node 24 writes "Tuesday, 10 November 2026" for `en-GB`). Build user-facing dates from `formatToParts` when tests compare exact text (booking P3-09).
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

- **UI route config** (verified 2.21.2, `@medusajs/admin-sdk/dist/index.d.ts`): `export const config = defineRouteConfig({ label?, icon?, nested?, rank?, translationNs? })`. With a `label`, the route shows in the sidebar; without one it doesn't. `icon` is a React component, usually from `@medusajs/icons`. That package isn't a declared dependency here, and pnpm refuses undeclared imports, so add it to `package.json` (exact pin) before using an icon. The page is served at `/app/<path>` (`pos/backend/src/admin/routes/pos-shifts/page.tsx` → `/app/pos-shifts`).
- **JS SDK on a server** (verified 2.21.2, `@medusajs/js-sdk/dist/client.js`, `auth/index.js`; POS app `pos/pos-app/src/lib/server/medusa.ts`):
  - **Config:** `new Medusa({ baseUrl, auth: { type: "jwt", jwtTokenStorageMethod: "nostore" } })`. `"local"` and `"session"` throw outside the browser. `"memory"` keeps the token on the instance, so on a server one shared SDK would carry one user's token into other users' requests. `"nostore"` stores nothing (`setToken_` has no case for it).
  - **Per-request token:** pass it on each call: `sdk.client.fetch(path, { method, body, query, headers: { authorization: "Bearer <jwt>" } })`.
  - **Sign-in:** `sdk.auth.login(actor, "emailpass", { email, password })` returns the JWT string, or an object for redirect, MFA or verification steps.
  - **Registration:** `sdk.auth.register(actor, "emailpass", …)` returns the registration token and calls `client.setToken` (a no-op under `"nostore"`).
  - **Errors:** a non-2xx response throws `FetchError` with `status` and the backend's `message`.
- **Data in admin pages:** `sdk.client.fetch<T>(path, { method?, body?, query? })` (`@medusajs/js-sdk` `types.d.ts`: `query?: Record<string, any>`) with `@tanstack/react-query` `useQuery` / `useMutation`. Both are already used by this repo's widgets. The SDK in `src/admin/lib/sdk.ts` uses session auth.
- **`@medusajs/ui` 4.2.6 components used** (checked against the installed exports): `Container`, `Heading`, `Text`, `Label`, `Input`, `Button`, `Badge` (`color`: green, red, blue, orange, grey or purple), `Select` with `.Trigger`, `.Value`, `.Content` and `.Item`, `Table` with `.Header`, `.Row`, `.HeaderCell`, `.Body`, `.Cell` and `.Pagination` (`count`, `pageSize`, `pageIndex`, `pageCount`, `canPreviousPage`, `canNextPage`, `previousPage`, `nextPage`), and `toast`. Radix `Select.Item` can't have the value `""`, so use a sentinel such as `"all"`.
- **Keep page logic testable:** put the grouping and formatting in a React-free module (`src/admin/lib/*.ts`) with a `__tests__/*.unit.spec.ts`. The unit runner covers `src/**`.

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
- **Background work in tests** (TASKS F-065): scheduled jobs also run inside the test app, and Search Module indexing runs after events, so a test must control or wait for them instead of racing them. Make a hold expire right before the step that checks it, and when an index may have missed events, rebuild it: `container.resolve<SearchTypes.ISearchModuleService>(Modules.SEARCH).reindex({ index: "product" })` (verified 2.22.6, `booking-services/backend/integration-tests/http/search.spec.ts`).
- **Subscribers run after the request, asynchronously:** poll for their result in HTTP tests (e.g. `reseller/backend/integration-tests/http/seller-commissions.spec.ts`, `eventually`).

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
| `medusa exec ./src/scripts/<file>.ts [args]` | Run a script (seed). Extra args are **positional** (the script gets them as `ExecArgs.args`); a `--flag` is rejected as "Unknown arguments" (verified 2.22.6, `seed:b2b demo-pricing`). Run seeds **after the first server start**: on a database that never booted, every product write logs `Search index "product" has no active version yet` (Medusa fills the indexes on start; the seed itself still succeeds) |
| `medusa plugin:develop \| plugin:build \| plugin:db:generate \| plugin:publish \| plugin:add` | Plugin lifecycle (`learn/fundamentals/plugins`) |

`db:migrate` takes a Postgres **advisory lock per module** (`pg_advisory_xact_lock(hashtext('db-module-migration:<module>'))`, in `@medusajs/modules-sdk/dist/medusa-app.js`, verified 2.21.1). Still run one migrating instance per deploy: the lock serializes each module's migration, not the whole deploy. It also runs `src/migration-scripts/*` (skip with `--skip-scripts`). **Any file in `src/migration-scripts/` runs automatically in production**, so never put demo seeds there.

**Connection check:** before migrating, `db:migrate` runs `SELECT 1` with a timeout of `MEDUSA_DB_MIGRATION_CONNECTION_TIMEOUT` (default 10000 ms). The pool hides connect errors (`propagateCreateError: false`), so a wrong URL **or wrong SSL setting** shows up as "The connection timed out after 10 seconds", not as the real error.

## 12. pnpm and build facts (plan spike §9, docs pnpm guide)

- Hoisting: the docs put `public-hoist-pattern[]` for `*@medusajs/*`, `@tanstack/react-query`, `react-i18next` and `react-router-dom` in `.npmrc`. pnpm ≥ 11 ignores these there, so this project puts them in `pnpm-workspace.yaml` as `publicHoistPattern`.
- pnpm 12 blocks install scripts until `allowBuilds` is set (`@swc/core`, `esbuild`, `msgpackr-extract`, `protobufjs`).
- `medusa build` doesn't copy the lockfile into `.medusa/server`. Copy it there before `pnpm install --prod --frozen-lockfile`.
- `tsc --noEmit` needs `.medusa/types`, so **build before typecheck**.
- `medusa start` must run **inside `.medusa/server`** after its own prod install. From the project root it fails with "Could not find index.html in the admin build directory" (verified 2.21.1; docs `learn/deployment/general`).
- The `medusaIntegrationTestRunner` teardown can log `[Search] Failed to seed "product" … terminating connection due to administrator command`. The Search Module seeds its index on app start and the runner drops the test database under it. The tests still pass; this is noise, not a failure (observed 2.21.1). **But** a product event handled before the seeding has an active index version is dropped ("Search index … has no active version yet"), so a test waiting for indexed documents can wait forever: after a short wait, call `container.resolve<SearchTypes.ISearchModuleService>(Modules.SEARCH).reindex({ index: "product" })` (starts a job, not awaited) and keep polling (TASKS F-065, 2.22.6).
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

This file is pinned to **2.21.2**. **Re-checked 2026-10-26 against the 2.22.0 / 2.22.1 release:** §1 versions, Node and starters; §1.1 rewritten from the preview notes into the verified release changes, each from the published 2.22.1 packages, the package changelogs or the docs. When the update lands, move the §1.1 items into their sections and change the pin. (Refreshed 2026-10-01 from 2.21.1: §1 and §6 checks re-run against `node_modules`; re-checked 2026-10-15: §1 versions, starters, RBAC flag note, new §1.1 2.22 preview notes; re-checked 2026-10-05 against the current docs: §1 Node and starter, §3 indexes, §4 link aliases, §6 core-flows (20 names), §7 middleware order, §8 event payloads, §11 CLI flags, new §15 providers). When `scripts/update-medusa.sh` moves to a new version:

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
