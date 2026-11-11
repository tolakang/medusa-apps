# Proposal for BUILD_PLAN.md Revision 10

`BUILD_PLAN.md` is frozen. This lists where Revision 9 no longer matches the repo after Wholesale P4-08 to P4-13, V-07 and the review fixes (2026-11-12). It is the text to apply, section by section. Nothing here changes requirements, scope or build order.

**To apply:** unlock (`docs/PLAN_LOCK.md`), then edit `BUILD_PLAN.md` yourself or ask Claude to while unlocked, update `.build-plan.sha256`, and give the PR the **`plan-revision`** label (CI refuses plan changes without it, guard check 1b). Lock again afterwards.

Claude started this on 2026-11-12 with the plan unlocked, but Claude Code's auto-mode safety check stopped it from writing the frozen plan and its checksum from the shell, so this proposal stands in. That one edit was undone, and the plan is unchanged.

## Header

| Where | Proposed |
|---|---|
| Revision note | "**Revision 10 (2026-11-12, owner: "Fix those").** Brings §6.2, §6.4, §6.5 and §7 in line with Wholesale P4-08 to P4-13 and the review fixes (TASKS F-066 to F-070, the first review's fix list, now done). Requirements, scope and build order are unchanged." |
| Status | "Phases 2 (POS), 3 (Booking services), 4 (Wholesale) and 5 (Reseller) have their code done, with staging and the exit checklists (P2-14, P3-18, P4-11, P5-11) waiting on the owner." |
| Versions table, pnpm row | "**12.18.0** (V-07), since 2026-11-12" |

## §1 Requirements, R5

- **R5 result column:** "`docs/COMPARISON.md` (moved from the root on the owner's request, 2026-11-12, F-071)".

## §2 Repo layout

- **Tree:** the root holds `README.md`, `BUILD_PLAN.md`, `.build-plan.sha256`, `CLAUDE.md`, the six category folders, `scripts/`, `.github/` and `.claude/`. Replace the six root lines for `COMPARISON.md`, `MEDUSA_SKILL.md`, `BACKEND_PATTERNS_SKILL.md`, `DEV_FLOW.md`, `TASKS.md` and `PRE_DEPLOY_AUDIT.md` with one: "`docs/` <- builder documents (`TASKS.md`, `MEDUSA_SKILL.md`, `DEV_FLOW.md`, `COMPARISON.md`, `BACKEND_PATTERNS_SKILL.md`, `PRE_DEPLOY_AUDIT.md`), owner notes (`PLAN_LOCK.md`), handovers, plan proposals".
- **Elsewhere in the plan:** write the moved files with their path (`docs/TASKS.md`, `docs/MEDUSA_SKILL.md`, `docs/DEV_FLOW.md`, `docs/PRE_DEPLOY_AUDIT.md`), as the rest of the repo now does. Short section citations such as "DEV_FLOW §7.1" stay as they are.

## §6.2 POS

- **Invite-only:** "an admin creates the cashier first (the answer carries an **invite code**); the cashier registers the invited email and accepts with that code (F-036, REVIEW_FIXES B11)."

## §6.4 Wholesale

- **New bullet after "Catalog scope":** "**Who sees the catalog** (F-068, X4): with `WHOLESALE_REQUIRE_LOGIN` on (default), the Store API's product, variant and search routes answer only an employee of an **approved** company; the publishable key alone gets 401, anyone else signed in 403. The storefront's `NEXT_PUBLIC_REQUIRE_LOGIN` shows its pages to the same people and sends others to their account page, which says why."
- **Payments, prepaid:** add "With PayWay set up, prepaid companies must pay with it and net-terms companies by invoice: checked when a payment session starts and at cart completion. Without PayWay keys, everyone pays by invoice."
- **Payments, new line:** "**One order at a time per company:** cart completion and quote acceptance run inside a lock on the company, so two checkouts can't both use the last of the credit (B6). Every placed order is linked to its company, so it keeps counting against the credit after its buyer leaves (B4, B5)."
- **Invoices, Language:** "every label in English and Khmer, font Kantumruy Pro (SIL OFL; D10, P4-13, F-070). USD and KHR print their sign, other currencies their code."
- **Invoices, new line:** "**Dates:** issued when the order is placed, or when a quote is accepted; a cancelled order is listed with nothing due (B2, B3)."
- **API routes, new line:** "**Colleagues join with consent** (B14): a company admin asks for a **join code** for an email (`POST /store/companies/me/employees` `{ email }`); the colleague, signed in with that email, joins with it (`POST /store/companies/join`). Nobody is added by id."
- **Client app:** "… (from the `b2b-starter` storefront `f352e3c`, P4-08) … quick order by SKU or CSV, reorder, invoices, quotes, company users and join codes. The starter's catalog for AI agents (UCP, `/buy`, `llms.txt`, sitemap) is off while login is required (F-068)."
- **Env:** add "**Catalog:** `WHOLESALE_REQUIRE_LOGIN` (default on; F-068)" and replace "the PayWay keys once P4-12 is done" with "`PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_API_URL`, `PAYWAY_RETURN_URL` (P4-12), and `pp_payway_payway` enabled on the region."

## §6.5 Reseller

- **Base:** "the order's items after discounts, without tax and shipping (`item_total − item_tax_total`; D11, P5-12; the first build used the order total, F-063). `order_total` stores this base."
- **Cancels and refunds:** "… A refund keeps the share of the order the shop kept, measured against the captured amount (an order's `total` goes down after a refund); cancelled at 0. A paid commission isn't changed by either, and payouts take the same per-order locks as refunds (B10)."
- **Invite-only:** "the shop creates the seller (`POST /admin/sellers`, which returns an **invite code**), and the seller registers, accepts with that code (`POST /sellers/accept` `{ invite_code }`) and signs in. The invited email alone can't take the account (B11)."

## §7 Status

```
**Status 2026-11-12:**
- Phase 0: done.
- Phase 1: on staging; production waiting (P1-08, P1-09).
- Phases 2, 3, 4 and 5: code done; staging and exit waiting (P2-14, P3-18, P4-11, P5-11).
- Phase 6: not started.
- The first full review's 29 findings and four later ones are fixed (2026-11-12).
```

## Revision history

New first row: "| 10 | 2026-11-12 | Wholesale as built after P4-08 to P4-13 and the review fixes: catalog for employees of approved companies (`WHOLESALE_REQUIRE_LOGIN`), join codes, PayWay for prepaid companies, one order at a time per company, bilingual invoices. Reseller: commission base and refund share, payout locks. POS and Reseller: invite codes. Status line. Builder documents in `docs/` (§2, R5). TASKS F-066 to F-071, D9 to D11. |"
