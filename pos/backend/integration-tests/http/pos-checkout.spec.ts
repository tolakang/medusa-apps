import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import { POS_MODULE } from "../../src/modules/pos"
import type PosModuleService from "../../src/modules/pos/service"
import { posCheckoutWorkflow } from "../../src/workflows/pos-checkout"
import { closePosShiftWorkflow, openPosShiftWorkflow } from "../../src/workflows/pos-shift"

// TASKS P2-05 (pos-checkout through draft orders, BUILD_PLAN §6.2). Data as
// on staging: the starter's demo products (seed-initial-data) plus the
// Cambodia shop (seed: default region, USD).
jest.setTimeout(240 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("pos-checkout (TASKS P2-05)", () => {
      let registerCode = 0
      const setup = async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        // The runner empties the database after each test.
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seedInitialData({ container })
        await seed({ container })
        const [store] = await container.resolve(Modules.STORE).listStores({})
        const {
          data: [variant],
        } = await query.graph({
          entity: "product_variant",
          fields: ["id", "title", "product.handle"],
          filters: { title: "L / White" },
        })
        const pos = container.resolve<PosModuleService>(POS_MODULE)
        const register = await pos.createPosRegisters({ name: "Till", code: `SALE-${++registerCode}` })
        await container.resolve(ContainerRegistrationKeys.LINK).create({
          [POS_MODULE]: { pos_register_id: register.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: store.default_sales_channel_id },
        })
        const { result: shift } = await openPosShiftWorkflow(container).run({
          input: { register_id: register.id, cashier_id: "pcash_1", opening_cash: 20 },
        })
        return { container, query, pos, store, register, shift, variant }
      }
      const error = (p: Promise<unknown>): Promise<string> =>
        p.then(() => "resolved").catch((e: Error) => e.message)

      const orderFields = [
        "id",
        "status",
        "is_draft_order",
        "sales_channel_id",
        "region_id",
        "currency_code",
        "total",
        "discount_total",
        "metadata",
        "items.quantity",
        "items.variant_id",
        "pos_shift.id",
        "payment_collections.status",
        "payment_collections.payments.captured_at",
        "payment_collections.payments.payment_session.metadata",
        "payment_collections.payments.captures.amount",
      ]

      it("sells for cash: draft → order in the register's channel, paid, linked to the shift", async () => {
        const { container, query, store, register, shift, variant } = await setup()
        const { result } = await posCheckoutWorkflow(container).run({
          input: {
            shift_id: shift.id,
            cashier_id: "pcash_1",
            items: [{ variant_id: variant.id, quantity: 2 }],
            payment_method: "cash",
          },
        })
        const {
          data: [order],
        } = await query.graph({ entity: "order", fields: orderFields, filters: { id: result.order_id } })
        expect(order).toEqual(
          expect.objectContaining({
            status: "pending",
            is_draft_order: false,
            sales_channel_id: store.default_sales_channel_id,
            region_id: store.default_region_id,
            currency_code: "usd",
          })
        )
        expect(order.metadata).toEqual(
          expect.objectContaining({ pos_register_id: register.id, pos_shift_id: shift.id, pos_cashier_id: "pcash_1" })
        )
        expect(order.items?.map((i) => [i?.variant_id, Number(i?.quantity)])).toEqual([[variant.id, 2]])
        expect(order.pos_shift?.id).toEqual(shift.id)
        expect(result.total).toBeGreaterThan(0)
        expect(Number(order.total)).toEqual(result.total)

        const [collection] = order.payment_collections ?? []
        expect(collection?.status).toEqual("completed")
        const [payment] = collection?.payments ?? []
        expect(payment?.captured_at).toBeTruthy()
        expect(payment?.payment_session?.metadata).toEqual({ pos_payment_method: "cash" })
        expect(Number(payment?.captures?.[0]?.amount)).toEqual(result.total)

        // close-pos-shift counts the sale: expected = 20 opening + the cash total.
        const { result: closed } = await closePosShiftWorkflow(container).run({
          input: { shift_id: shift.id, cashier_id: "pcash_1", counted_cash: 20 + result.total },
        })
        expect(Number(closed.shift.expected_cash)).toEqual(20 + result.total)
        expect(closed.variance).toEqual(0)
      })

      it("applies a promotion code, and a card sale is not cash", async () => {
        const { container, query, shift, variant } = await setup()
        await container.resolve(Modules.PROMOTION).createPromotions({
          code: "POS10",
          type: "standard",
          status: "active",
          application_method: { type: "percentage", target_type: "order", allocation: "across", value: 10, currency_code: "usd" },
        })
        const sell = (promo_codes: string[]) =>
          posCheckoutWorkflow(container).run({
            input: {
              shift_id: shift.id,
              cashier_id: "pcash_1",
              items: [{ variant_id: variant.id, quantity: 1 }],
              payment_method: "card",
              promo_codes,
            },
          })
        const { result: full } = await sell([])
        const { result: discounted } = await sell(["POS10"])
        expect(discounted.total).toBeCloseTo(full.total * 0.9, 2)
        const {
          data: [order],
        } = await query.graph({ entity: "order", fields: orderFields, filters: { id: discounted.order_id } })
        expect(Number(order.discount_total)).toBeGreaterThan(0)
        expect(order.payment_collections?.[0]?.payments?.[0]?.payment_session?.metadata).toEqual({
          pos_payment_method: "card",
        })

        const { result: closed } = await closePosShiftWorkflow(container).run({
          input: { shift_id: shift.id, cashier_id: "pcash_1", counted_cash: 20 },
        })
        expect(Number(closed.shift.expected_cash)).toEqual(20)
      })

      it("refuses a closed shift, no items, an unknown method, a register without a channel; nothing is created", async () => {
        const { container, pos, shift, variant } = await setup()
        const sell = (input: Record<string, unknown>) =>
          error(
            posCheckoutWorkflow(container).run({
              input: {
                shift_id: shift.id,
                cashier_id: "pcash_1",
                items: [{ variant_id: variant.id, quantity: 1 }],
                payment_method: "cash",
                ...input,
              } as never,
            })
          )
        const orders = container.resolve(Modules.ORDER)
        const [, before] = await orders.listAndCountOrders({})

        expect(await sell({ items: [] })).toContain("at least one item")
        expect(await sell({ items: [{ variant_id: variant.id, quantity: 0 }] })).toContain("at least one item")
        expect(await sell({ payment_method: "voucher" })).toContain("payment method must be")
        expect(await sell({ shift_id: "pshift_missing" })).toContain("was not found")
        expect(await sell({ promo_codes: ["NOPE"] })).toContain("NOPE is invalid")

        const bare = await pos.createPosRegisters({ name: "Bare", code: `SALE-${++registerCode}` })
        const { result: bareShift } = await openPosShiftWorkflow(container).run({
          input: { register_id: bare.id, cashier_id: "pcash_1", opening_cash: 0 },
        })
        expect(await sell({ shift_id: bareShift.id })).toContain("no sales channel")

        await closePosShiftWorkflow(container).run({
          input: { shift_id: shift.id, cashier_id: "pcash_1", counted_cash: 20 },
        })
        expect(await sell({})).toContain("shift is closed")

        const [, after] = await orders.listAndCountOrders({})
        expect(after).toEqual(before)
      })
    })
  },
})
