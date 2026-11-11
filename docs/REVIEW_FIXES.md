# Review fixes: collected issues, fixed later in one go

**What this is:** issues found by full repo reviews (auditor agents, then verifier agents re-checking each one against the code). The owner decided on 2026-11-11 to keep collecting them here while development continues, then fix them all at once.

**How to use it**
- **Adding:** a later full review appends its verified findings to *Open findings* under a new *Review* heading, with the same columns. Skip anything already listed.
- **Fixing:** fix in the batches below, one branch and PR per batch, through DEV_FLOW gates and the skill check (DEV_FLOW §7.1). Tick the row and add the PR number.
- **Deleting:** when every row is ticked or rejected, delete this file in the last fix PR, and remove its line from `TASKS.md` and `README.md`.

Paths are relative to the repo root. W = `wholesale/backend/src`, R = `reseller/backend/src`, P = `pos/backend/src`. Line numbers are from 2026-11-11 and may move.

## Review 1 (2026-11-11)

Five auditors (security, backend correctness, web clients, CI and Docker, drift between copied apps) and two verifiers. 29 findings verified, 2 rejected. Spot-checked by the manager session: B1, B11, C4.

### Batch 1: Security

Done 2026-11-12 (PR #152). B11 was fixed with a one-time **invite code** instead of email verification: the admin gets the code with the invitation (`invite_code` in the admin API), and accepting needs the invited email and the code. It needs no email delivery, which suits tills and sellers the shop adds by hand. Known limit: someone who registers the invited email first still can't take the account, but the real person then can't set a password for that email; the shop invites another email.

| ✓ | ID | Sev | Problem | Where | Best fix |
|---|---|---|---|---|---|
| [x] #152 | B11 | high | Invite takeover: whoever registers the invited email first gets the seller or cashier account, because these actors never verify their email. | `reseller/backend/medusa-config.ts:228-230` and `pos/backend/medusa-config.ts` (only `customer` in `authVerificationsPerActor`); R `workflows/seller/accept-seller-invite.ts:20-37`; the POS cashier accept step | Add `seller` and `cashier` to `authVerificationsPerActor`, send their verification email from the subscriber, **and** in the accept step require a verified email: `authModule.listAuthVerifications({ auth_identity_id, entity_id, entity_type: "email" })[0]?.verified_at` (as `validate-verification.js:28`). The config alone isn't enough: the actorless token still passes `registrationAuth`. Confirm the API in the installed `.d.ts`. |
| [x] #152 | C4 | high | One attacker locks out every seller or cashier: the portal and POS app sign in from their own server without the client IP, so all users share one 20/min per-IP limit. | `reseller/seller-portal/src/app/login/actions.ts:17,55`, `pos/pos-app/src/app/login/actions.ts:17,55`; backend `auth-guards.ts:122-154` | Forward the client IP with `SHOPPER_IP_SECRET` as the storefront does (`reseller/storefront/src/lib/config.ts:32-42`, `lib/data/shopper-ip.ts`) for `/auth/` calls. Add `SHOPPER_IP_SECRET` and `CLIENT_IP_HEADER` to both `.env.example`. Test that two IPs get separate buckets. |
| [x] #152 | B17 | medium | No per-IP limit on cashier password reset; no strong-password check on the password-change routes for cashiers, sellers and admins. | P `api/middlewares.ts:173-180`; R `api/middlewares.ts:99-110` | `limitPerIp("cashier_password_reset", …)` on `/auth/cashier/emailpass/reset-password`; `requireStrongPassword` on `/auth/{cashier,seller,user}/emailpass/update`. |

### Batch 2: Wholesale money rules

Done 2026-11-12 (PR #153). Choices: spending windows are in UTC (B1). B5 is an `order.placed` subscriber, because `completeCartWorkflow` has no official hook for the created order. B6 is a middleware that runs cart completion and quote acceptance inside a Locking Module lock per company (`src/api/store/company-order-lock.ts`), instead of a custom complete route, so the storefront keeps calling the core route.

| ✓ | ID | Sev | Problem | Where | Best fix |
|---|---|---|---|---|---|
| [x] #153 | B1 | high | The daily spending limit never counts today's earlier orders: `now.setHours()` mutates `now`, so the window ends at midnight. Windows also use server-local time, not UTC. | W `utils/check-spending-limit.ts:30` | `const start = new Date(now); start.setHours(0,0,0,0)`. Decide UTC vs local. Add tests for daily and weekly windows. |
| [x] #153 | B4 | high | Removing an employee drops their unpaid orders from the company's credit check, freeing credit. | W `utils/load-b2b-buyer.ts:115-137`; delete route `store/companies/me/employees/[employeeId]/route.ts` | Count outstanding orders through the order↔company link (`links/order-company.ts`). Needs B5. Interim: refuse to remove an employee with unpaid net-terms orders. |
| [x] #153 | B5 | medium | Shop checkouts never get the order↔company link: the hook is on `createOrderWorkflow` (quotes only); `completeCartWorkflow` uses `createOrdersStep`, and its `orderCreated` hook is `@ignore`, not an official extension point. | W `workflows/hooks/order-created.ts:7` | An `order.placed` subscriber that finds the buyer's company and creates the link if missing. |
| [x] #153 | B6 | medium | Two checkouts at once (or quote accepts) can both pass the credit and spending checks; core locks only the cart. | W `workflows/hooks/validate-cart-completion.ts:61-74`; quote accept | Wrapper workflow `acquireLockStep({ key: "b2b-credit:<company_id>" })` → `completeCartWorkflow.runAsStep` → `releaseLockStep` with a custom complete route (MEDUSA_SKILL §6 "Wrapping completeCartWorkflow"); same key in quote accept. Or log as an accepted risk. |
| [x] #153 | B3 | medium | `GET /store/invoices` shows cancelled orders as due (full total). | W `api/store/invoices/route.ts:38-71` | Read `status`; `amount_due = 0` for `canceled` (as `countsAsSpend` in `b2b-cart-rules.ts:109`). |
| [x] #153 | B2 | medium | An accepted quote's invoice is dated from the draft's creation, so the due date can already be past. | W `workflows/invoice/steps/ensure-invoice.ts:41` | Run `ensureInvoiceWorkflow.runAsStep` at the end of the quote-accept workflow with the issue date set in a step. |
| [x] #153 | B9 | low | Invoice created twice at once (subscriber and PDF download) → unique-index 500, a skipped `INV-` number. | W `ensure-invoice.ts:17-42` | `acquireLockStep({ key: "invoice:<order_id>" })` / `releaseLockStep`. |
| [x] #153 | B8 | low | The order-created hook's compensation always throws (dismisses one side only). | W `workflows/hooks/order-created.ts:38-42` | Pass `company_id` and dismiss both sides, as `cart-created.ts:54-61`. Moot if B5 moves to a subscriber. |

### Batch 3: Wholesale data exposure

| ✓ | ID | Sev | Problem | Where | Best fix |
|---|---|---|---|---|---|
| [ ] | B12 | medium | Bulk add-to-cart accepts any `?fields=` (no `allowed` list; defaults `*customer`, `*company`), so a cart id can expose coworkers' emails and phones. | W `api/store/carts/middlewares.ts:16-23`, `[id]/line-items/bulk/route.ts`, `query-config.ts` | `allowed` / `disallowed` in the query config, explicit customer fields, `authenticate("customer")` and a `cart.customer_id === actor_id` check. |
| [ ] | B14 | medium | A company admin can add any customer by id without consent; the response shows their email and phone. | W `api/store/companies/me/employees/route.ts:40-77` | Invite by email, accepted by the customer on an authenticated route. At least: require an email match and drop the PII from the response. |
| [ ] | B13 | low-med | Quote routes return `*messages.admin` (admin user records) and accept any `fields`. | W `api/store/quotes/query-config.ts:7-8` | Name the admin fields (`messages.admin.first_name`), add `allowed` / `disallowed`. |
| [ ] | B16 | low-med | Approval decision: `status: z.string()` (not strict, not an enum), no pending check, 404 vs 403 reveals other companies' ids. | W `api/store/approvals/validators.ts:27-29`, `[id]/route.ts`, `middlewares.ts:15-45` | `z.object({ status: z.enum(["approved","rejected"]) }).strict()`, refuse unless pending, one 404 for "not found or not yours". |

### Batch 4: Storefronts and portals

Done 2026-11-12 (PR #155). C5 also covers the POS app, which sent the till to sign-in on any backend error.

| ✓ | ID | Sev | Problem | Where | Best fix |
|---|---|---|---|---|---|
| [x] #155 | C1 | medium | Stale order status after an admin refund or cancel (plan §4.2 change 10, F-052, fixed only in booking). | `{ecommerce,pos,reseller}/storefront/src/lib/data/orders.ts:26,72` | `cache: "no-store"` in both reads, copied from `booking-services/storefront/src/lib/data/orders.ts`. |
| [x] #155 | C5 | medium | Any backend error (e.g. 502) signs every seller out; neither the portal nor the POS app has an error page. | `reseller/seller-portal/src/lib/server/seller.ts:26`; no `error.tsx` / `global-error.tsx` in `seller-portal` or `pos-app` | Sign out only on 401/403, throw otherwise; add `app/error.tsx` and `global-error.tsx` like the storefronts. |
| [x] #155 | C2 | low | `/store/locales` called on every page view (a 404 each time; plan §4.2 change 11, F-051). | `{ecommerce,pos,reseller}/storefront/src/lib/data/locales.ts:15-28` | Port booking's `STOREFRONT_LOCALES` guard and `.env.example` line. |
| [x] #155 | C3 | low | Wrong default region: compose `dk` in ecommerce and reseller; Dockerfile `"us"` in ecommerce, booking and reseller storefronts (`.env.example` and pos say `kh`). | `ecommerce/docker-compose.local.yml:90`, `reseller/docker-compose.local.yml:91`, `*/storefront/Dockerfile:35` | `kh` everywhere, as pos. |
| [x] #155 | C6 | low | The seller portal signs out on a GET, so a link on another site can sign a seller out. | `reseller/seller-portal/src/app/logout/route.ts:5-8` | Don't clear the cookie when `sec-fetch-site` is `cross-site`. |

### Batch 5: Tooling and CI

Done 2026-11-12 (PR #156). T1 in code: guard check 1b fails a branch that changes the plan or its lock without the owner's `plan-revision` label, and `.github/CODEOWNERS` is added. **Still the owner's:** turning on "Require review from Code Owners" in the `main` ruleset (docs/PLAN_LOCK.md).

| ✓ | ID | Sev | Problem | Where | Best fix |
|---|---|---|---|---|---|
| [x] #156 | T1 | high | A PR can change the frozen plan and auto-merge: guard only checks plan = checksum; no CODEOWNERS. | `scripts/guard.sh:34`, `.github/workflows/ci.yml` | Code: CI fails when the PR diff touches `BUILD_PLAN.md`, `.build-plan.sha256` or the lock files (DEV_FLOW Gate 5's diff check). **Owner:** add `.github/CODEOWNERS` and turn on code-owner review in the `main` ruleset. |
| [x] #156 | T2 | medium | `verify.sh --image` only smoke-tests the backend server on `/health`; DEV_FLOW Gate 4 also asks for worker mode, `/app/` 200 and client images serving their port. | `scripts/verify.sh:86-113` | Add a worker run (still running after N s), `curl /app/`, and a client run with a port check. |
| [x] #156 | T4 | low-med | The pin check lets `>=2.22.6` and `2.x` through; nothing checks all `@medusajs/*` share one version. | `scripts/guard.sh:69` | Require `^[0-9]+\.[0-9]+\.[0-9]+$` and one distinct version (except `@medusajs/ui`). |
| [x] #156 | T10 | low | Dockerfile header comments say `Build Path = /<category>/<app>` (wrong per plan §5, F-011) and "STATUS: ready template". | `*/backend/Dockerfile:4,9`, `{wholesale,marketplace}/storefront/Dockerfile`, `marketplace/vendor-portal/Dockerfile` | Copy the pos / storefront header wording. `wholesale/storefront` done with P4-08. |
| [x] #156 | T7 | low | Guard patterns are narrow: no `@ts-expect-error`, `zod/v4` missed, the entrypoint check is satisfied by a comment. | `scripts/guard.sh:87,95,118` | Widen the regexes; grep the `db:migrate` line itself, ignoring comments. |
| [x] #156 | T9 | low | The reseller local stack has no `seller-portal`; wholesale has no local stack (plan §4.3). | `reseller/docker-compose.local.yml`; `wholesale/` | Add a seller-portal service copied from pos-app. Wholesale's file was added with P4-08 and run end to end on 2026-11-12 (P4-10). |
| [x] #156 | T5 | low | Guard check 12 prints "skip" and passes when the base ref is missing (doesn't happen in CI today). | `scripts/guard.sh:119-120` | `fail` instead of `skip` when `CI=true`. |
| [x] #156 | T6 | low | The env-file check misses `.env.production.local`. | `scripts/guard.sh:41` | Regex `\.env(\.[^/]+)*$`. |
| [x] #156 | T8 | low | The CI matrix is hand-written; a new deployable with code would not be built. | `.github/workflows/ci.yml:34-45` | A guard check that every deployable with a `package.json` is in the matrix. |
| [x] #156 | T3 | low | Actions pinned to tags, not commit SHAs. | `ci.yml:22,66,67,70`, `medusa-update-check.yml:19-20` | Pin to SHAs with a version comment (optional). |

### Reseller

| ✓ | ID | Sev | Problem | Where | Best fix |
|---|---|---|---|---|---|
| [ ] | B10 | medium | A payout can mark as paid a commission a refund has just cancelled: it lists, then updates, without the per-order lock. Same for the approve step. | R `workflows/seller/steps/payout.ts:13-58` | Lock `commissions.map(c => "seller-commission:" + c.order_id)` (array key), re-list inside the lock, then update. |
| [ ] | P5-12 | — | Commission still on the order total, not items only (D11). Already a task in `TASKS.md`. | R `steps/record-commission.ts:57`, `modules/seller/commission.ts:54` | See TASKS P5-12. |

### Found later, outside a full review

| ✓ | ID | Sev | Problem | Where | Best fix |
|---|---|---|---|---|---|
| [ ] | X1 | low | The worker logs `Cannot read properties of undefined (reading 'product_id')` on `product-option.created` (seen while seeding, 2026-11-12, F-069). Ecommerce fixed this helper for shared product options (F-023); the wholesale backend has the starter's copy. | `wholesale/backend/src/search/helpers/resolve-product-ids.ts` | Port the F-023 fix from `ecommerce/backend/src/search/helpers/resolve-product-ids.ts`. |
| [ ] | X2 | low | The sign-in page logs one `Error: Unauthorized` per view: the account dashboard slot is rendered for guests too and asks for approvals. | `wholesale/storefront/src/modules/account/templates/account-layout` (via `@dashboard/layout.tsx`) | Skip the approvals call when there is no customer. |
| [ ] | X3 | low | `wholesale/storefront` keeps a cart cookie whose cart no longer exists: checkout answers 404 until something is added to the cart. | `wholesale/storefront/src/lib/data/cart.ts` (`retrieveCart`) | Clear the cookie when the backend says the cart is not found. |
| [ ] | X4 | medium | Any signed-in customer can read the wholesale catalog and prices, also one whose company is still `pending` (F-068 stopped at "signed in"). | `wholesale/backend/src/api/store/catalog/middlewares.ts` | Owner decision: also require an employee of an `approved` company when `WHOLESALE_REQUIRE_APPROVAL=true`. |

### Rejected or by design

| ID | Why |
|---|---|
| T11 | `NEXT_PUBLIC_MEDUSA_PAYMENTS_*` in the storefront payment wrapper is the starter's Stripe code; this repo doesn't use Stripe. |
| T12 | Refuted: `verify.sh` removes the smoke-test container before exiting on failure. |
| B15 | A `pending` seller signing in is intended ("signed up, not selling yet"); they only edit their own channel. Revisit if the owner wants `active` only. |

### Untested paths found (add tests with the fixes)

Daily and weekly spending windows; invoice and due date of an accepted quote; a cancelled order in the invoice list; concurrent checkouts against one credit limit; credit after an employee is removed; a refund on an approved commission; `mark-paid` with a `currency_code` filter.
