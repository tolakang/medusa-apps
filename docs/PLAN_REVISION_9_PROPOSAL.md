# Proposal for BUILD_PLAN.md Revision 9

`BUILD_PLAN.md` is frozen (CLAUDE.md), so Claude doesn't edit it. This file lists where it no longer matches the built apps (checked 2026-11-11 against `main` and `TASKS.md`), with the text to change and the finding behind each change. To apply it, follow `docs/PLAN_LOCK.md`: unlock, edit (or ask Claude to, while unlocked), update the checksum, lock again.

Nothing here changes scope. Sections 1 to 5 record what was built and decided; section 6 records the owner's answers to the questions this audit raised, with the plan text they need.

## 1. Header (line 4, "Versions") and §3.2 (versions and pins)

| Where | Now | Proposed | Why |
|---|---|---|---|
| Header, "Versions (checked 2026-11-06)" | Medusa **2.22.3** in every app; both starters on 2.22.3; storefronts on Next.js 16.3.8 | Medusa **2.22.6** in every app (since 2026-11-10, a security release: stricter `fields` / filter / `order` query parsing; TASKS V-06); both starters on 2.22.6 (`b2b-starter` `f352e3c`). Next.js 16.4.5, pnpm 12.17.0, Node `>=22.23.4` unchanged | V-06, F-055, F-057 (2) |
| §3.2, the `@medusajs/ui` pin list | "for 2.22.3 (every app since 2026-11-06) 4.2.10" | add: "for **2.22.6** (every app since 2026-11-10) **4.2.13**" | V-06 |
| §3.2, "Each app has its own Medusa version" | "since 2026-11-06 all on 2.22.3" | "since 2026-11-10 all on **2.22.6**" | V-06 |
| §3.2 (new sentence) | — | "pnpm 12 refuses packages younger than its minimum release age. Updating on release day writes `minimumReleaseAgeExclude` entries for the exact new versions into `pnpm-workspace.yaml`; keep them for a security release, and remove them at the next update." | F-057 (1) |
| §8.1 "Starter syncs" | "both starters to Medusa 2.22.3" | add: "Both starters moved to 2.22.6 on 2026-11-09; every app followed on 2026-11-10 (V-06)." | F-055 |
| §10 R-i and R-j | "after Medusa 2.22.3" / "all on 2.22.3 since" | "after Medusa 2.22.6 (`zod` 4.2.0 still the only high)" / "all on 2.22.6 since 2026-11-10" | V-06 |

## 2. §6.4 Wholesale

| Topic | Now in the plan | Proposed | Why |
|---|---|---|---|
| Starter | "b2b-starter on 2026-11-06 at 2.22.3 … record the commit copied" | "Backend copied from `b2b-starter` **`47eecab`** (the last 2.22.3 commit), then moved to 2.22.6. The storefront (P4-08) is copied from **`f352e3c`** (2.22.6)." | F-055, P4-01 |
| Company fields | "add payment_terms prepaid/net_15/net_30/net_60, credit_limit, tax_id, status" | add values and meanings: `status` `pending` / `approved` (default) / `suspended`, and only `approved` companies buy; `credit_limit` null = not enforced, enforced on net terms only | P4-02, P4-04 |
| Minimum order quantity | "minimum order quantity" (no field named) | "`metadata.min_order_quantity` on the variant, else on its product" | P4-04 |
| Approvals | "approval flow for orders above a limit" | "`approval_settings.approval_threshold` (merchant only). Above it, every switched-on approval type must be approved before checkout; no threshold = every cart. A company admin's own cart skips the company-admin approval, not the sales manager's. Items lock while pending or approved." | P4-05, F-059 (owner's three rules, 2026-11-10) |
| Company of a cart or order | — | "Always from the customer's employee record, never from cart metadata." | F-059 |
| Quotes | "request-quote / accept-quote (via draft orders)" | add: "Accepting a quote runs the checkout rules (own quote, approved company, spending and credit limits on the quoted total)." | P4-05 (owner) |
| API routes | "`/store/companies/me`, `/store/companies/me/employees`, `/store/quotes`" | add: "The starter's `/store/companies/:id…` routes are removed; `/me…` takes the company from the employee record. Sign-up creates the company and its first admin together." | F-058, P4-07 |
| `WHOLESALE_REQUIRE_APPROVAL` | "new companies need admin approval" | "`true`: a company that signs up in the storefront starts `pending`; companies the admin creates start `approved`." | P4-07 |
| Invoices | "Invoice PDF follows the official invoice tutorial pattern" | add: "Module `invoice` (`INV-000001`, one per order, company / tax ID / terms snapshot, due date from the terms). The PDF is at `GET /admin/orders/:id/invoice` and `GET /store/orders/:id/invoice` (the buyer or their company admin only); `GET /store/invoices` shows what's due. Seller details come from `INVOICE_SELLER_*`." | P4-06 |

## 3. §6.5 Reseller

| Topic | Now in the plan | Proposed | Why |
|---|---|---|---|
| Starting point | (not stated) | "`reseller/backend` and `reseller/storefront` are a full copy of Ecommerce (owner, 2026-11-10); `seller-portal` is a plain Next.js app like `pos/pos-app`." | F-061 |
| `seller` fields | "status, commission_rate" | "`status` `pending` / `active` / `suspended` (only `active` earns); `commission_rate` is a percent 0–100, null = `RESELLER_DEFAULT_COMMISSION_RATE`; `handle` URL-safe; `domain` a lowercase host, unique" | F-062 |
| Seller auth | "custom actor type `seller` … `/auth/seller/emailpass`" | add: "Invite-only, like POS cashiers: the shop creates the seller (`POST /admin/sellers`, which also creates their sales channel and key), the seller registers, accepts (`POST /sellers/accept`) and signs in." | P5-03 |
| Commission | "order → sales channel → seller → commission; idempotent" | add: "on the order `total` (shipping and tax included); one per order, guarded by a lock and the unique `order_id`; a refund recalculates it on what the shop kept; a paid commission isn't changed by a cancel or refund" | F-063, P5-04 |
| Payouts | "monthly payout batch" | "Manual payouts. On `RESELLER_PAYOUT_DAY` (1–28) the job approves last month's pending commissions; `GET /admin/seller-payouts` reports what is due; `POST /admin/sellers/:id/payouts` records a payout (approved → paid)." | F-064, P5-05 |
| API routes | "`/sellers/me`, `/sellers/me/products`, `/sellers/me/commissions`" | add: "`/sellers/me/orders` (the portal's sales, no customer details) and `GET /store/sellers/resolve` (domain or handle → an active seller's publishable key)" | P5-07, P5-08 |
| Storefront | "resolves the seller by domain … CORS regex or server-side calls" | add: "The `Host` header (not `x-forwarded-host`). Next.js caches data per publishable key (its cache key includes headers). Browser search on a seller's domain needs that origin in `STORE_CORS`." | P5-07 |
| Seller portal CORS | "a CORS middleware reading `SELLER_CORS` … portal domains also go in `AUTH_CORS`" | add: "The built portal calls the backend from its own server only (sealed session cookie), so it needs neither; keep `SELLER_CORS` for a browser-side client." | P5-08 |

## 4. §7 build order, status line

| Now | Proposed |
|---|---|
| "Status 2026-11-06: … Phases 4–6 not started." | "Status 2026-11-11: Phase 1 on staging, production waiting (P1-08). Phases 2, 3 and 5 code done, staging and exit waiting for the owner (P2-14, P3-18, P5-11). Phase 4 backend done (P4-01 to P4-07), storefront next (P4-08). Phase 6 not started." |

## 5. §8 / DEV_FLOW: flaky tests

Proposed new line in §8 (CI gate): "Tests that depend on background work (scheduled jobs, search indexing) must control or wait for it, not race it: make a hold expire right before the step that checks it, and rebuild a search index with the Search Module's `reindex` when events may have been lost." (F-065)

## 6. Owner decisions (2026-11-11)

| # | Question | Decision | Follow-up |
|---|---|---|---|
| 1 | Reseller commission base | **Items only**: after discounts, without tax and shipping (Claude's recommendation, accepted) | §6.5: "commission on the order's items after discounts, without tax or shipping". Task P5-12 (D9) |
| 2 | Payouts manual or a `seller_payout` record | **Stay manual** (recommendation, accepted); add the record when there are enough sellers to need statements | §6.5 keeps `seller_payout` as "later" (D9) |
| 3 | Wholesale invoices in Khmer | **Yes**, with an embedded Khmer font | §6.4 invoices: "in Khmer and English". Task P4-13 (D8) |
| 4 | Payment for prepaid wholesale companies | **QR payment**: ABA PayWay (KHQR, cards), the Ecommerce provider; net terms stay on `pp_system_default` | §6.4 payments: "PayWay for prepaid companies". Task P4-12 (D7) |
| 5 | pnpm 12.18.0 | **Move from 2026-11-12**, when it is a week old (released 2026-11-05; still npm `latest`) | Task V-07; §3.2 pnpm pin |
