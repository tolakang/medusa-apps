import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import type MarketplaceModuleService from "../../src/modules/marketplace/service"
import { createVendorPayoutsWorkflow } from "../../src/workflows/marketplace/create-payouts"
import { cancelVendorCommissionWorkflow } from "../../src/workflows/marketplace/record-vendor-commission"
import {
  NOT_TO_REVIEW_MESSAGE,
  REDUCE_NEEDS_AMOUNT_MESSAGE,
} from "../../src/workflows/marketplace/refund-review"
import { IP_SECRET, marketplaceTestKit } from "../helpers/marketplace"

jest.setTimeout(240 * 1000)

// TASKS P6-06 and P6-11 (plan §6.6): a commission per vendor child order,
// monthly payouts per vendor and currency, the admin's payout report, and
// "payouts equal order totals minus commission".
medusaIntegrationTestRunner({
  env: { SHOPPER_IP_SECRET: IP_SECRET, MARKETPLACE_DEFAULT_COMMISSION_RATE: "10" },
  testSuite: ({ api, getContainer }) => {
    describe("vendor commissions and payouts (TASKS P6-06, P6-11)", () => {
      const kit = marketplaceTestKit(api, getContainer)
      const marketplace = () =>
        getContainer().resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
      let shop: Awaited<ReturnType<typeof kit.setupShop>>
      let admin: { headers: Record<string, string> }

      beforeEach(async () => {
        shop = await kit.setupShop()
        admin = await kit.adminAuth()
      })

      const call = (request: Promise<any>) =>
        request.then(
          (res) => res,
          (err) => err.response
        )

      // Two vendors: Dara at the default 10 %, Sok at its own 20 %.
      const twoVendorOrder = async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        const sok = await kit.signUpVendor(admin, "sok@vendor.test", "Sok Goods")
        await api.post(`/admin/vendors/${sok.id}`, { commission_rate: 20 }, admin)
        await kit.giveProducts(dara.id, ["t-shirt"])
        await kit.giveProducts(sok.id, ["sweatshirt"])
        const cartId = await kit.readyCart(shop, [
          { handle: "t-shirt", quantity: 2 },
          { handle: "sweatshirt", quantity: 1 },
        ])
        const res = await api.post(`/store/carts/${cartId}/complete-vendor`, {}, shop.store)
        return { dara, sok, res }
      }

      const nextMonth = () => {
        const now = new Date()
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 2))
      }
      const runPayouts = () => {
        const thisMonth = new Date().toISOString().slice(0, 7)
        return createVendorPayoutsWorkflow(getContainer()).run({
          input: { cutoff: nextMonth(), period: thisMonth },
        })
      }

      it("records one commission per child order with the vendor's rate", async () => {
        const { dara, sok, res } = await twoVendorOrder()
        const children = res.data.vendor_orders as { vendor_id: string; order_id: string }[]
        const commissions = await marketplace().listVendorCommissions({})
        expect(commissions).toHaveLength(2)

        const { data: orders } = await kit.query().graph({
          entity: "order",
          fields: ["id", "total", "item_total", "item_tax_total", "currency_code"],
          filters: { id: children.map((c) => c.order_id) },
        })
        for (const child of children) {
          const order = orders.find((o) => o.id === child.order_id)!
          const commission = commissions.find((c) => c.order_id === child.order_id)!
          const rate = child.vendor_id === sok.id ? 20 : 10
          const base = Number(order.item_total) - Number(order.item_tax_total)
          expect(commission.vendor_id).toBe(child.vendor_id)
          expect(commission.rate).toBe(rate)
          expect(Number(commission.base)).toBeCloseTo(base, 2)
          expect(Number(commission.amount)).toBeCloseTo((base * rate) / 100, 2)
          expect(Number(commission.order_total)).toBeCloseTo(Number(order.total), 2)
          expect(Number(commission.payout_amount)).toBeCloseTo(
            Number(order.total) - Number(commission.amount),
            2
          )
          expect(commission.status).toBe("pending")
        }
        // The parent order has no commission.
        expect(commissions.map((c) => c.order_id)).not.toContain(res.data.order.id)
        // A retried checkout records none twice; a new order adds one.
        const nextCart = await kit.readyCart(shop, [{ handle: "t-shirt", quantity: 1 }])
        await api.post(`/store/carts/${nextCart}/complete-vendor`, {}, shop.store)
        await api.post(`/store/carts/${nextCart}/complete-vendor`, {}, shop.store)
        expect(await marketplace().listVendorCommissions({ vendor_id: dara.id })).toHaveLength(2)
      })

      it("payouts equal the child order totals minus commission (P6-11)", async () => {
        const { dara, sok, res } = await twoVendorOrder()
        const { result } = await runPayouts()
        expect(result.map((p) => p.vendor_id).sort()).toEqual([dara.id, sok.id].sort())

        const { data: orders } = await kit.query().graph({
          entity: "order",
          fields: ["id", "total", "vendor.id"],
          filters: { id: res.data.vendor_orders.map((c: { order_id: string }) => c.order_id) },
        })
        const commissions = await marketplace().listVendorCommissions({})
        for (const payout of result) {
          const order = orders.find((o) => o.vendor?.id === payout.vendor_id)!
          const commission = commissions.find((c) => c.order_id === order.id)!
          expect(payout.amount).toBeCloseTo(Number(order.total) - Number(commission.amount), 2)
          expect(commission.status).toBe("approved")
          expect(commission.payout_id).toBe(payout.id)
        }

        // Running it again makes no second payout.
        const again = await runPayouts()
        expect(again.result).toEqual([])
        expect(await marketplace().listVendorPayouts({})).toHaveLength(2)
      })

      it("leaves commissions recorded after the cutoff for the next payout", async () => {
        await twoVendorOrder()
        const { result } = await createVendorPayoutsWorkflow(getContainer()).run({
          input: { cutoff: new Date(Date.now() - 60 * 60 * 1000), period: "2026-10" },
        })
        expect(result).toEqual([])
        expect(
          (await marketplace().listVendorCommissions({})).every((c) => c.status === "pending")
        ).toBe(true)
      })

      it("the admin's report lists payouts and records a paid one", async () => {
        await twoVendorOrder()
        await runPayouts()
        const report = await call(api.get("/admin/vendor-payouts?status=pending", admin))
        expect(report.status).toBe(200)
        expect(report.data.count).toBe(2)
        expect(report.data.vendor_payouts[0].vendor.name).toBeTruthy()
        const payoutId = report.data.vendor_payouts[0].id

        const detail = await call(api.get(`/admin/vendor-payouts/${payoutId}`, admin))
        expect(detail.data.vendor_payout.commissions).toHaveLength(1)

        expect(
          (await call(api.post(`/admin/vendor-payouts/${payoutId}/pay`, {}, admin))).status
        ).toBe(400)
        const paid = await call(
          api.post(`/admin/vendor-payouts/${payoutId}/pay`, { reference: "ABA-TRX-1" }, admin)
        )
        expect(paid.status).toBe(200)
        expect(paid.data.vendor_payout).toEqual(
          expect.objectContaining({ status: "paid", reference: "ABA-TRX-1" })
        )
        expect(paid.data.vendor_payout.paid_at).toBeTruthy()
        const [commission] = await marketplace().listVendorCommissions({ payout_id: payoutId })
        expect(commission.status).toBe("paid")

        // Paying twice is refused; unknown payouts are 404.
        expect(
          (
            await call(
              api.post(`/admin/vendor-payouts/${payoutId}/pay`, { reference: "again" }, admin)
            )
          ).status
        ).toBe(400)
        expect(
          (await call(api.post(`/admin/vendor-payouts/vpay_missing/pay`, { reference: "x" }, admin)))
            .status
        ).toBe(404)
        expect((await call(api.get("/admin/vendor-payouts?status=paid", admin))).data.count).toBe(1)
        expect((await call(api.get("/admin/vendor-payouts?status=open", admin))).status).toBe(400)
      })

      it("a cancelled child order loses its commission before payout, not after", async () => {
        const { res } = await twoVendorOrder()
        const [first, second] = res.data.vendor_orders as { order_id: string }[]

        await cancelOrderWorkflow(getContainer()).run({
          input: { order_id: first.order_id },
        })
        await cancelVendorCommissionWorkflow(getContainer()).run({
          input: { order_id: first.order_id },
        })
        const [cancelled] = await marketplace().listVendorCommissions({ order_id: first.order_id })
        expect(cancelled.status).toBe("cancelled")

        const { result } = await runPayouts()
        expect(result).toHaveLength(1)

        // Once in a payout, a cancel leaves the commission alone.
        await cancelVendorCommissionWorkflow(getContainer()).run({
          input: { order_id: second.order_id },
        })
        const [kept] = await marketplace().listVendorCommissions({ order_id: second.order_id })
        expect(kept.status).toBe("approved")
      })

      // F-078 (owner: "hold and flag now, automate later").
      const refundParent = async (parentId: string, amount: number) => {
        const {
          data: [parent],
        } = await kit.query().graph({
          entity: "order",
          fields: ["payment_collections.payments.id"],
          filters: { id: parentId },
        })
        const paymentId = parent.payment_collections![0]!.payments![0]!.id
        await api.post(`/admin/payments/${paymentId}/capture`, {}, admin)
        await api.post(`/admin/payments/${paymentId}/refund`, { amount }, admin)
      }
      const eventually = async <T,>(read: () => Promise<T>, ok: (v: T) => boolean) => {
        let value = await read()
        for (let i = 0; i < 40 && !ok(value); i++) {
          await new Promise((r) => setTimeout(r, 250))
          value = await read()
        }
        return value
      }

      it("a refund on the customer's order holds and flags its vendor commissions (F-078)", async () => {
        const { res } = await twoVendorOrder()
        await refundParent(res.data.order.id, 5)

        // payment.refunded flags both vendors' commissions at once.
        const flagged = await eventually(
          () => marketplace().listVendorCommissions({}),
          (list) => list.every((c) => c.refund_review === "to_review")
        )
        expect(flagged.map((c) => c.refund_review)).toEqual(["to_review", "to_review"])

        // The payout job holds them: no payout, still pending.
        expect((await runPayouts()).result).toEqual([])
        expect((await marketplace().listVendorCommissions({})).every((c) => c.status === "pending")).toBe(true)

        // The report lists them with the customer order's refund.
        const report = await call(api.get("/admin/vendor-commissions?refund_review=to_review", admin))
        expect(report.status).toBe(200)
        expect(report.data.count).toBe(2)
        expect(report.data.vendor_commissions[0].parent_order).toEqual(
          expect.objectContaining({ id: res.data.order.id, refunded: 5 })
        )
      })

      it("the payout job flags a refund even if the event was missed", async () => {
        const { res } = await twoVendorOrder()
        await refundParent(res.data.order.id, 5)
        const list = await eventually(
          () => marketplace().listVendorCommissions({}),
          (l) => l.every((c) => c.refund_review === "to_review")
        )
        // As if payment.refunded never arrived.
        await marketplace().updateVendorCommissions(list.map((c) => ({ id: c.id, refund_review: "none" as const })))

        expect((await runPayouts()).result).toEqual([])
        expect(
          (await marketplace().listVendorCommissions({})).map((c) => c.refund_review)
        ).toEqual(["to_review", "to_review"])
      })

      it("settled commissions go into the next payout: keep, reduce, cancel", async () => {
        const { dara, sok, res } = await twoVendorOrder()
        await refundParent(res.data.order.id, 5)
        const held = await eventually(
          () => marketplace().listVendorCommissions({}),
          (l) => l.every((c) => c.refund_review === "to_review")
        )
        const daras = held.find((c) => c.vendor_id === dara.id)!
        const soks = held.find((c) => c.vendor_id === sok.id)!
        const settle = (id: string, body: Record<string, unknown>) =>
          call(api.post(`/admin/vendor-commissions/${id}/settle`, body, admin))

        // Reduce needs an amount below what the vendor gets now.
        for (const bad of [{ action: "reduce" }, { action: "reduce", payout_amount: Number(daras.payout_amount) + 1 }]) {
          const r = await settle(daras.id, bad)
          expect(r.status).toBe(400)
          expect(r.data.message).toBe(REDUCE_NEEDS_AMOUNT_MESSAGE)
        }
        expect((await settle(daras.id, { action: "hide" })).status).toBe(400)

        const reduced = await settle(daras.id, { action: "reduce", payout_amount: 3 })
        expect(reduced.status).toBe(200)
        expect(reduced.data.vendor_commission).toEqual(
          expect.objectContaining({ refund_review: "settled", payout_amount: 3, status: "pending" })
        )
        const cancelled = await settle(soks.id, { action: "cancel" })
        expect(cancelled.data.vendor_commission).toEqual(
          expect.objectContaining({ refund_review: "settled", status: "cancelled" })
        )
        // Once settled, there's nothing to review.
        const again = await settle(daras.id, { action: "keep" })
        expect(again.status).toBe(400)
        expect(again.data.message).toBe(NOT_TO_REVIEW_MESSAGE)
        expect((await settle("vcom_missing", { action: "keep" })).status).toBe(404)

        // The next payout pays Dara the reduced amount and Sok nothing.
        const { result } = await runPayouts()
        expect(result).toEqual([expect.objectContaining({ vendor_id: dara.id, amount: 3 })])
        expect((await call(api.get("/admin/vendor-commissions?refund_review=to_review", admin))).data.count).toBe(0)
      })

      it("keep pays the full amount", async () => {
        const { dara, res } = await twoVendorOrder()
        await refundParent(res.data.order.id, 1)
        const held = await eventually(
          () => marketplace().listVendorCommissions({}),
          (l) => l.every((c) => c.refund_review === "to_review")
        )
        for (const c of held) {
          expect((await call(api.post(`/admin/vendor-commissions/${c.id}/settle`, { action: "keep" }, admin))).status).toBe(200)
        }
        const { result } = await runPayouts()
        const daraCommission = held.find((c) => c.vendor_id === dara.id)!
        expect(result.find((p) => p.vendor_id === dara.id)!.amount).toBeCloseTo(Number(daraCommission.payout_amount), 2)
        expect((await call(api.post(`/admin/vendor-commissions/${daraCommission.id}/settle`, { action: "keep" }, dara.auth))).status).toBe(401)
      })

      it("a vendor sees its own payouts and what isn't paid out yet", async () => {
        const { dara, sok } = await twoVendorOrder()
        const before = await call(api.get("/vendors/me/payouts", dara.auth))
        expect(before.status).toBe(200)
        expect(before.data.vendor_payouts).toEqual([])
        expect(before.data.not_yet_paid_out).toEqual([
          expect.objectContaining({ currency_code: "usd" }),
        ])
        expect(before.data.not_yet_paid_out[0].amount).toBeGreaterThan(0)

        await runPayouts()
        const after = await call(api.get("/vendors/me/payouts", dara.auth))
        expect(after.data.vendor_payouts).toHaveLength(1)
        expect(after.data.not_yet_paid_out).toEqual([])
        const theirs = await call(api.get("/vendors/me/payouts", sok.auth))
        expect(theirs.data.vendor_payouts[0].id).not.toBe(after.data.vendor_payouts[0].id)
        // Not for admins or anonymous callers.
        expect((await call(api.get("/vendors/me/payouts", admin))).status).toBe(401)
        expect((await call(api.get("/admin/vendor-payouts", dara.auth))).status).toBe(401)
      })
    })
  },
})
