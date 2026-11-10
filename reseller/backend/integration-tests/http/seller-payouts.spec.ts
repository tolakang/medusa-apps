import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { SELLER_MODULE } from "../../src/modules/seller"
import SellerModuleService from "../../src/modules/seller/service"
import { sellerPayoutBatchWorkflow } from "../../src/workflows/seller/payout"
import sellerPayoutBatch from "../../src/jobs/seller-payout-batch"

jest.setTimeout(120 * 1000)

// TASKS P5-05 (plan §6.5): the monthly payout batch approves what is due;
// the shop pays outside Medusa and records it per seller.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("seller payouts (TASKS P5-05)", () => {
      let admin: { headers: Record<string, string> }
      const sellers = () => getContainer().resolve<SellerModuleService>(SELLER_MODULE)
      const pause = () => new Promise((resolve) => setTimeout(resolve, 20))

      const seller = (handle: string) =>
        sellers().createSellers({ handle, name: handle, email: `${handle}@seller.test`, status: "active" })
      let orders = 0
      const commission = (
        sellerId: string,
        amount: number,
        fields: { status?: "pending" | "approved" | "paid" | "cancelled"; currency_code?: string } = {}
      ) =>
        sellers().createSellerCommissions({
          seller_id: sellerId,
          order_id: `order_${++orders}`,
          order_total: amount * 10,
          rate: 10,
          amount,
          currency_code: "usd",
          ...fields,
        })
      const statusOf = async (id: string) =>
        (await sellers().listSellerCommissions({ id }))[0].status

      beforeEach(async () => {
        const container = getContainer()
        const email = "admin@shop.test"
        const user = await container.resolve(Modules.USER).createUsers({ email })
        await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { user_id: user.id },
        })
        await container
          .resolve(Modules.AUTH)
          .updateProvider("emailpass", { entity_id: email, password: "supersecret1" })
        const { data } = await api.post("/auth/user/emailpass", { email, password: "supersecret1" })
        admin = { headers: { authorization: `Bearer ${data.token}` } }
      })

      it("the batch approves pending commissions from before the cutoff, once", async () => {
        const sok = await seller("sok")
        const dara = await seller("dara")
        const early = [await commission(sok.id, 10), await commission(sok.id, 2.5), await commission(dara.id, 4)]
        const done = await commission(sok.id, 99, { status: "paid" })
        const gone = await commission(sok.id, 99, { status: "cancelled" })
        await pause()
        const cutoff = new Date()
        await pause()
        const late = await commission(sok.id, 7)

        const { result } = await sellerPayoutBatchWorkflow(getContainer()).run({ input: { cutoff } })
        expect(result.approved).toEqual(3)
        expect(result.due).toEqual(
          expect.arrayContaining([
            { seller_id: sok.id, currency_code: "usd", amount: 12.5, count: 2 },
            { seller_id: dara.id, currency_code: "usd", amount: 4, count: 1 },
          ])
        )
        for (const c of early) {
          expect(await statusOf(c.id)).toEqual("approved")
        }
        expect(await statusOf(late.id)).toEqual("pending")
        expect(await statusOf(done.id)).toEqual("paid")
        expect(await statusOf(gone.id)).toEqual("cancelled")

        const again = await sellerPayoutBatchWorkflow(getContainer()).run({ input: { cutoff } })
        expect(again.result.approved).toEqual(0)
      })

      it("the report shows what is due and what is pending; paying records it per seller", async () => {
        const sok = await seller("sok")
        const dara = await seller("dara")
        const due = [
          await commission(sok.id, 10, { status: "approved" }),
          await commission(sok.id, 3000, { status: "approved", currency_code: "khr" }),
        ]
        const daraDue = await commission(dara.id, 4, { status: "approved" })
        const notYet = await commission(sok.id, 5)

        const report = (await api.get("/admin/seller-payouts", admin)).data
        expect(report.due).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ seller_id: sok.id, currency_code: "usd", amount: 10, seller: { handle: "sok", name: "sok" } }),
            expect.objectContaining({ seller_id: sok.id, currency_code: "khr", amount: 3000 }),
            expect.objectContaining({ seller_id: dara.id, amount: 4 }),
          ])
        )
        expect(report.pending).toEqual([expect.objectContaining({ seller_id: sok.id, amount: 5 })])

        // Pay Sok's USD only.
        const paidUsd = await api.post(`/admin/sellers/${sok.id}/payouts`, { currency_code: "USD" }, admin)
        expect(paidUsd.data.paid).toEqual(1)
        expect(paidUsd.data.totals).toEqual([{ seller_id: sok.id, currency_code: "usd", amount: 10, count: 1 }])
        expect(await statusOf(due[0].id)).toEqual("paid")
        expect(await statusOf(due[1].id)).toEqual("approved")

        const paidRest = await api.post(`/admin/sellers/${sok.id}/payouts`, {}, admin)
        expect(paidRest.data.paid).toEqual(1)
        const [paid] = await sellers().listSellerCommissions({ id: due[1].id })
        expect(paid.status).toEqual("paid")
        expect(paid.paid_at).toBeTruthy()

        // Pending and other sellers' commissions are untouched; paying again does nothing.
        expect(await statusOf(notYet.id)).toEqual("pending")
        expect(await statusOf(daraDue.id)).toEqual("approved")
        expect((await api.post(`/admin/sellers/${sok.id}/payouts`, {}, admin)).data.paid).toEqual(0)
      })

      it("refuses an unknown seller, a bad body and non-admins", async () => {
        const call = (p: Promise<any>) => p.then((r) => r, (e) => e.response)
        expect((await call(api.post("/admin/sellers/sel_missing/payouts", {}, admin))).status).toEqual(404)
        const sok = await seller("sok")
        expect((await call(api.post(`/admin/sellers/${sok.id}/payouts`, { amount: 5 }, admin))).status).toEqual(400)
        expect((await call(api.post(`/admin/sellers/${sok.id}/payouts`, {}))).status).toEqual(401)
        expect((await call(api.get("/admin/seller-payouts"))).status).toEqual(401)
      })

      it("the job only runs on RESELLER_PAYOUT_DAY, and approves last month's commissions", async () => {
        const today = new Date().getUTCDate()
        if (today > 28) {
          // No payout day can be the 29th to 31st (payoutDay is 1 to 28).
          return
        }
        const sok = await seller("sok")
        const lastMonth = await commission(sok.id, 10)
        // Back-date it to before this month (the job's cutoff is the 1st).
        // (Test setup only: the module's update type has no created_at.)
        await getContainer()
          .resolve(ContainerRegistrationKeys.PG_CONNECTION)
          .raw("update seller_commission set created_at = ? where id = ?", [
            "2000-01-15T00:00:00Z",
            lastMonth.id,
          ])
        const [moved] = await sellers().listSellerCommissions({ id: lastMonth.id })
        expect(new Date(moved.created_at).getUTCFullYear()).toEqual(2000)
        const thisMonth = await commission(sok.id, 3)

        const original = process.env.RESELLER_PAYOUT_DAY
        try {
          process.env.RESELLER_PAYOUT_DAY = String(today === 1 ? 2 : 1)
          await sellerPayoutBatch(getContainer())
          expect(await statusOf(lastMonth.id)).toEqual("pending")

          process.env.RESELLER_PAYOUT_DAY = String(today)
          await sellerPayoutBatch(getContainer())
          expect(await statusOf(lastMonth.id)).toEqual("approved")
          expect(await statusOf(thisMonth.id)).toEqual("pending")
        } finally {
          process.env.RESELLER_PAYOUT_DAY = original
        }
      })
    })
  },
})
