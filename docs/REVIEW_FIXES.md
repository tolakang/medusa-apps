# Review fixes: collected issues, fixed later in one go

**What this is:** issues found by full repo reviews (auditor agents, then challenger agents trying to refute each one against the code). The owner decided on 2026-11-11 to collect them here and fix them all at once.

**How to use it**
- **Adding:** a later review appends its verified findings under a new *Review* heading, with the same columns. Skip anything already listed.
- **Fixing:** fix in the batches below, one branch and PR per batch, through DEV_FLOW gates and the skill check (DEV_FLOW §7.1). Tick the row and add the PR number.
- **Deleting:** when every row is ticked or rejected, delete this file in the last fix PR, and remove its line from `docs/TASKS.md` and `README.md`.

Paths are relative to the repo root. MP = `marketplace/backend/src`, BK = `booking-services/backend/src`, W = `wholesale/backend/src`, P = `pos/backend/src`. Line numbers are from 2026-11-12 and may move. Review 1 is in git history (`git show c0e62c49:docs/REVIEW_FIXES.md`).

## Review 2 (2026-11-12): risky areas before staging

Three auditors (money, access, stock and orders) and two challengers. 16 findings confirmed: 2 high, 9 medium, 5 low. The challengers lowered six severities and disproved one part of A2 (unpublished products are not exposed). Spot-checked by the manager session: M1, A1.

### Batch 1: PayWay money (all PayWay apps)

| ✓ | ID | Sev | Problem | Where | Best fix |
|---|---|---|---|---|---|
| [x] #179 | M2 | high | PayWay refunds never reach Medusa: `refundPayment` always throws (portal refunds are the planned limit, plan §4). So `refunded_amount` stays 0, and the marketplace refund hold (F-078) and the reseller commission adjustment never fire: vendors and sellers are paid commission on refunded orders. Also, admin **Cancel order** fails for every captured PayWay order in every app, because `cancelOrderWorkflow` runs `refundCapturedPaymentsWorkflow`. | `*/backend/src/modules/payway/service.ts:289-296`; MP `workflows/marketplace/refund-review.ts:44-57`, `create-payouts.ts:37-48`; `reseller/backend/src/workflows/seller/steps/adjust-commission.ts:34-58` | Implement PayWay's Refund API in `refundPayment` (the owner has ABA's RSA key, TASKS P1-03 follow-up). Until then, an admin action to flag a commission for review by hand, and a note in the admin READMEs that a PayWay order can't be cancelled. Check Transaction status 4 only covers full refunds, so it isn't enough on its own. |
| [x] #179 | M1 | medium | Booking: the PayWay page stays payable for 30 min, but the hold is renewed for only 15 min when payment starts. Pay after 15 min → the release job expires the hold → cart completion refuses it → money taken, no order, and the paid session can't be deleted. | BK `modules/payway/service.ts:150` (`lifetime_minutes ?? 30`); `booking-services/backend/medusa-config.ts:254-262` (no `lifetime_minutes`); BK `modules/booking/service.ts:215-250`; `lib/booking-cart-rules.ts:58-68` | Set the PayWay `lifetime_minutes` to `BOOKING_HOLD_MINUTES` (PayWay's minimum is 3), or renew holds for at least the PayWay lifetime. |
| [x] #179 | M5 | low | `updatePayment` signs a new `tran_id` without checking or closing the old one. Only reachable by calling core's update-session route by hand (the storefront never does): pay the old transaction → no order, and paying again charges twice. | `*/backend/src/modules/payway/service.ts:182-191` | Keep the `tran_id` when amount and currency are unchanged; otherwise apply `deletePayment`'s paid-check and close to the old one. |

### Batch 2: Wholesale

| ✓ | ID | Sev | Problem | Where | Best fix |
|---|---|---|---|---|---|
| [x] #180 | S3 | high | An accepted quote's order reserves no stock for unchanged items: `createOrdersWorkflow` doesn't reserve, the order edit reserves only added or changed items, and the local `updateOrderWorkflow` only flips the draft flag. The shop oversells, and staff can't fulfil the order ("No stock reservation found"). | W `workflows/quote/workflows/customer-accept-quote.ts:42-55`, `create-request-for-quote.ts:72` | `convertDraftOrderWorkflow.runAsStep` (MEDUSA_SKILL §358; reserves every item) before `confirmOrderEditRequestWorkflow`. It also emits `order.placed`: check the wholesale subscribers (emails, invoice) for duplicates. Test: accept an unchanged quote → reservations exist → fulfilment works. |
| [x] #180 | A2 | medium | Wholesale prices leak to anyone: the sign-in gate (F-068) skips `/store/collections`, whose core query config allows `products.variants.prices`. That returns base prices and every group's tier prices (price lists). | W `api/store/catalog/middlewares.ts:15-17, 52-67`; test `integration-tests/http/catalog-login.spec.ts:55-57` | Gate `/store/collections*` (and `/store/product-categories*`, which leaks titles and SKUs) with the same buyer checks whenever `fields` asks for `products`, and keep bare lists open for the sign-in page. Test `fields=*products.variants.prices`. |
| [x] #180 | M3 | medium | The spending limit is checked only at cart completion, after PayWay has taken the money → captured payment, no order. The storefront pre-check still has the B1 bug (`now.setHours` mutates `now`), so a daily limit counts 0 spent. | W `api/store/middlewares.ts:22-27`, `api/store/payment-terms-middleware.ts:14-42`, `workflows/hooks/validate-cart-completion.ts:83`; `wholesale/storefront/src/lib/util/check-spending-limit.ts:20` | Run `assertBuyerCanSpend` (and the approval check) in the payment-sessions middleware; port the B1 UTC window fix to the storefront util. |

### Batch 3: Marketplace

| ✓ | ID | Sev | Problem | Where | Best fix |
|---|---|---|---|---|---|
| [ ] | A1 | medium | A vendor can link its own variant to another vendor's inventory item (`variants[].inventory_items` in the admin product body; core only checks the item exists), then set stock on it. The other vendor's product is oversold, and its stock moves with this vendor's sales. | MP `api/middlewares.ts:58-62` (`AdminCreateProduct`), `api/vendors/products/route.ts:111-131`, `api/vendors/products/[id]/stock/route.ts:37-52`, `lib/vendor-stock.ts:79-85` | A strict vendor schema without `inventory_items` (refuse it at least). Optionally have the stock route check that the item is linked only to the vendor's own variants. Integration test. |
| [ ] | S1 | medium | If the vendor split fails midway on the `order.placed` path (or after the webhook already completed the cart), the paid parent loses its stock reservations, and the retry creates children with none → vendors can't fulfil. | MP `workflows/marketplace/create-vendor-orders.ts:223-232, 290-324` | In the catch and compensation, re-create the parent reservations from `created.moved` when the parent wasn't created in this run. Test: fail the split from the subscriber path. |
| [ ] | S2 | medium | Cancelling a parent order leaves its vendor child orders open: reservations stay held, vendors can still fulfil, commissions go to the next payout. (Uncaptured or system-payment orders; PayWay-captured ones can't be cancelled, M2.) | MP `subscribers/vendor-commission-order-canceled.ts:10`, `api/vendors/me/orders/[id]/fulfillments/route.ts:18` | `order.canceled` subscriber: for a parent, run `cancelOrderWorkflow` on each unfulfilled child (frees reservations, cancels commissions through the existing subscriber); flag fulfilled children for the admin. |
| [ ] | S6 | low | Payout day race: `create-payouts` sets listed commissions to `approved` under the global lock only, so a commission cancelled in those seconds is paid anyway. | MP `workflows/marketplace/create-payouts.ts:30-33, 63-65`, `record-vendor-commission.ts:96-116`, `refund-review.ts:108-135` | Reseller's B10 pattern: per-order `acquireLockStep` keys in cancel, settle and payout, and list again inside the lock. |
| [ ] | M4 | low | Customers can set `child_order_ids` / `parent_order_id` in cart metadata (copied to the order), which skips the vendor split for their own order and makes `complete-vendor` return the injected orders' ids and vendor ids. | MP `workflows/marketplace/create-vendor-orders.ts:355-369, 388`, `subscribers/vendor-orders-order-placed.ts:26` | A middleware on `/store/carts*` that refuses these keys, or keep the parent↔child relation in a link instead of metadata. |
| [ ] | A3 | low | Vendors never verify their email, so someone can sign up with a brand's address; if approved, the real owner is locked out and can't reset the password (the reset subscriber has no vendor link). Admin approval is the only guard. | `marketplace/backend/medusa-config.ts:228-230`; MP `workflows/marketplace/create-vendor.ts:38-55`, `subscribers/auth-password-reset.ts:27-33` | Add `vendor` to `authVerificationsPerActor`, require a verified identity in `create-vendor` (as B11), and add vendor-portal links to the verification and reset subscribers. |

### Batch 4: Booking

| ✓ | ID | Sev | Problem | Where | Best fix |
|---|---|---|---|---|---|
| [x] #182 | S4 | medium | Between cart completion and the async `order.placed` confirm, a hold can expire: confirm sets `pending` → `confirmed` with no lock or slot re-check and only warns on `expired`, and the release job expires holds of completed carts. → Overbooking, or a paid order with an expired booking. Overlaps M1. | BK `workflows/confirm-order-bookings.ts:55-82`, `workflows/hooks/booking-cart.ts:110-127`, `modules/booking/service.ts:272-283` | Confirm inside the module under the same `FOR UPDATE` resource lock as `createHold`, accepting expired holds whose slot is still free; the release job skips holds whose cart has `completed_at`. |
| [x] #182 | S5 | medium | Cancelling an order never releases its bookings: they stay `confirmed`, block the slot, and still get the reminder. (Staff can cancel bookings one by one in admin.) | BK `subscribers/` (no `order.canceled` handler), `modules/booking/service.ts:28` | `order.canceled` subscriber that cancels the linked bookings without a refund (`cancelOrderWorkflow` already refunded). |

### Batch 5: POS and shared jobs

| ✓ | ID | Sev | Problem | Where | Best fix |
|---|---|---|---|---|---|
| [ ] | S7 | medium | A POS sale retried after a network error is recorded twice: stock taken twice and expected cash counted twice (a shortfall at shift close). | `pos/pos-app/src/components/sell.tsx:63-69`, `payment.tsx:39-45`; P `api/pos/checkout/route.ts:8-11` | Client UUID per sale; the workflow locks on it and checks a `client_ref` unique column on a POS-module record before creating the order, returning the existing one if found. |
| [ ] | S8 | low | Once over 500 kept accounts are older than the window, the unverified-account cleanup deletes nothing: it takes the 500 oldest identities, then filters. | `{ecommerce,pos,booking-services,reseller,marketplace}/backend/src/workflows/cleanup-unverified-accounts.ts:48-54` | Page through (skip or cursor) until candidates are found or the list ends. |
