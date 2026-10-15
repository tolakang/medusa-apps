import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow } from "@medusajs/medusa/core-flows"
import { POS_MODULE } from "../../src/modules/pos"
import type PosModuleService from "../../src/modules/pos/service"
import { closePosShiftWorkflow, openPosShiftWorkflow } from "../../src/workflows/pos-shift"

// TASKS P2-04 (open-shift, close-shift) and P2-12 (acceptance: a shift close
// computes the correct cash variance), BUILD_PLAN §6.2. The workflows run on
// the real modules; payments go through Medusa's system provider, marked cash
// or card on the payment session (the pos-checkout contract, P2-05).
jest.setTimeout(180 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("Shift workflows (TASKS P2-04, P2-12)", () => {
      let registerCode = 0
      const setup = async () => {
        const container = getContainer()
        const stores = container.resolve(Modules.STORE)
        let [store] = await stores.listStores({}, { relations: ["supported_currencies"] })
        if (!store) {
          await createDefaultsWorkflow(container).run()
          ;[store] = await stores.listStores({}, { relations: ["supported_currencies"] })
        }
        await stores.updateStores(store.id, {
          supported_currencies: [
            { currency_code: "usd", is_default: true },
            { currency_code: "khr" },
          ],
        })
        const pos = container.resolve<PosModuleService>(POS_MODULE)
        const register = await pos.createPosRegisters({ name: "Till", code: `SHIFT-${++registerCode}` })
        return { container, pos, register }
      }
      const error = (p: Promise<unknown>): Promise<string> =>
        p.then(() => "resolved").catch((e: Error) => e.message)

      // An order linked to the shift with one captured payment (and optional
      // refund), cash or card.
      const sale = async (
        shiftId: string,
        { amount, method, currency = "usd", refund }: { amount: number; method: string; currency?: string; refund?: number }
      ) => {
        const container = getContainer()
        const payments = container.resolve(Modules.PAYMENT)
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const [order] = await container.resolve(Modules.ORDER).createOrders([{ currency_code: currency }])
        const collection = await payments.createPaymentCollections({ currency_code: currency, amount })
        const session = await payments.createPaymentSession(collection.id, {
          provider_id: "pp_system_default",
          currency_code: currency,
          amount,
          data: {},
          metadata: { pos_payment_method: method },
        })
        const payment = await payments.authorizePaymentSession(session.id, {})
        if (!payment) {
          throw new Error("The system provider did not authorize the payment.")
        }
        await payments.capturePayment({ payment_id: payment.id, amount })
        if (refund) {
          await payments.refundPayment({ payment_id: payment.id, amount: refund })
        }
        await link.create([
          { [Modules.ORDER]: { order_id: order.id }, [Modules.PAYMENT]: { payment_collection_id: collection.id } },
          { [POS_MODULE]: { pos_shift_id: shiftId }, [Modules.ORDER]: { order_id: order.id } },
        ])
      }

      it("opens a shift in the store's default currency", async () => {
        const { container, register } = await setup()
        const { result: shift } = await openPosShiftWorkflow(container).run({
          input: { register_id: register.id, cashier_id: "pcash_1", opening_cash: 50 },
        })
        expect(shift).toEqual(
          expect.objectContaining({ status: "open", opened_by: "pcash_1", currency_code: "usd" })
        )
        expect(Number(shift.opening_cash)).toEqual(50)
        expect(shift.opened_at).toBeTruthy()
      })

      it("allows one open shift per register", async () => {
        const { container, pos, register } = await setup()
        const open = (cashier: string) =>
          openPosShiftWorkflow(container).run({
            input: { register_id: register.id, cashier_id: cashier, opening_cash: 0 },
          })
        await open("pcash_1")
        expect(await error(open("pcash_2"))).toContain("already has an open shift")

        const other = await pos.createPosRegisters({ name: "Till 2", code: `SHIFT-${++registerCode}` })
        await expect(
          openPosShiftWorkflow(container).run({ input: { register_id: other.id, cashier_id: "pcash_2", opening_cash: 0 } })
        ).resolves.toBeTruthy()
      })

      it("opens only one shift when two cashiers open the same register at once", async () => {
        const { container, pos, register } = await setup()
        const results = await Promise.allSettled(
          Array.from({ length: 5 }, (_, i) =>
            openPosShiftWorkflow(container).run({
              input: { register_id: register.id, cashier_id: `pcash_${i}`, opening_cash: 0 },
            })
          )
        )
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
        expect(await pos.listPosShifts({ register_id: register.id, status: "open" })).toHaveLength(1)
      })

      it("refuses an inactive or unknown register, a foreign currency and negative cash", async () => {
        const { container, pos, register } = await setup()
        const open = (input: Record<string, unknown>) =>
          error(
            openPosShiftWorkflow(container).run({
              input: { register_id: register.id, cashier_id: "pcash_1", opening_cash: 0, ...input },
            })
          )
        expect(await open({ register_id: "preg_missing" })).toContain("was not found")
        expect(await open({ currency_code: "eur" })).toContain("store's currencies")
        expect(await open({ opening_cash: -1 })).toContain("can't be negative")

        await pos.updatePosRegisters({ id: register.id, is_active: false })
        expect(await open({})).toContain("not active")
        expect(await pos.listPosShifts({ register_id: register.id })).toHaveLength(0)
      })

      it("P2-12: closes with expected cash from cash payments and the variance", async () => {
        const { container, pos, register } = await setup()
        const { result: shift } = await openPosShiftWorkflow(container).run({
          input: { register_id: register.id, cashier_id: "pcash_1", opening_cash: 50 },
        })
        await sale(shift.id, { amount: 12.5, method: "cash" })
        await sale(shift.id, { amount: 20, method: "cash", refund: 5 })
        await sale(shift.id, { amount: 30, method: "card" })
        await sale(shift.id, { amount: 40000, method: "cash", currency: "khr" })

        // 50 + 12.5 + (20 - 5) = 77.5 expected; 76 counted → 1.50 short.
        const { result } = await closePosShiftWorkflow(container).run({
          input: { shift_id: shift.id, cashier_id: "pcash_2", counted_cash: 76, notes: "1.50 short" },
        })
        expect(result.variance).toEqual(-1.5)
        expect(Number(result.shift.expected_cash)).toEqual(77.5)
        expect(Number(result.shift.counted_cash)).toEqual(76)
        expect(result.shift).toEqual(
          expect.objectContaining({ status: "closed", closed_by: "pcash_2", notes: "1.50 short" })
        )
        expect(result.shift.closed_at).toBeTruthy()

        // The register can open the next shift.
        await expect(
          openPosShiftWorkflow(container).run({ input: { register_id: register.id, cashier_id: "pcash_2", opening_cash: 76 } })
        ).resolves.toBeTruthy()
        const [stored] = await pos.listPosShifts({ id: shift.id })
        expect(stored.status).toEqual("closed")
      })

      it("closes a shift with no sales at the opening cash, and an exact count has no variance", async () => {
        const { container, register } = await setup()
        const { result: shift } = await openPosShiftWorkflow(container).run({
          input: { register_id: register.id, cashier_id: "pcash_1", opening_cash: 25 },
        })
        const { result } = await closePosShiftWorkflow(container).run({
          input: { shift_id: shift.id, cashier_id: "pcash_1", counted_cash: 25 },
        })
        expect(Number(result.shift.expected_cash)).toEqual(25)
        expect(result.variance).toEqual(0)
      })

      it("refuses to close twice, an unknown shift and negative counted cash", async () => {
        const { container, register } = await setup()
        const { result: shift } = await openPosShiftWorkflow(container).run({
          input: { register_id: register.id, cashier_id: "pcash_1", opening_cash: 0 },
        })
        const close = (input: Record<string, unknown>) =>
          error(
            closePosShiftWorkflow(container).run({
              input: { shift_id: shift.id, cashier_id: "pcash_1", counted_cash: 0, ...input },
            })
          )
        expect(await close({ counted_cash: -5 })).toContain("can't be negative")
        expect(await close({ shift_id: "pshift_missing" })).toContain("was not found")
        expect(await close({})).toEqual("resolved")
        expect(await close({})).toContain("already closed")
      })

      it("closes only once when two closes run at the same moment", async () => {
        const { container, register } = await setup()
        const { result: shift } = await openPosShiftWorkflow(container).run({
          input: { register_id: register.id, cashier_id: "pcash_1", opening_cash: 10 },
        })
        const results = await Promise.allSettled(
          [10, 11].map((counted) =>
            closePosShiftWorkflow(container).run({
              input: { shift_id: shift.id, cashier_id: "pcash_1", counted_cash: counted },
            })
          )
        )
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
      })
    })
  },
})
