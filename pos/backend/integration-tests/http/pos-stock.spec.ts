import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import { POS_MODULE } from "../../src/modules/pos"
import type PosModuleService from "../../src/modules/pos/service"
import { posCheckoutWorkflow } from "../../src/workflows/pos-checkout"
import { POS_IN_STORE_CODE } from "../../src/workflows/pos-in-store"
import { createPosRegisterWorkflow } from "../../src/workflows/pos-register"
import { openPosShiftWorkflow } from "../../src/workflows/pos-shift"
import { levelAt, stockAt } from "../helpers/pos-stock"

// TASKS P2-11 acceptance (BUILD_PLAN §6.2): "a sale at a register reduces
// stock at that shop's location only". Data as on staging: the demo seed's
// European Warehouse holds 1,000,000 of every item in the default sales
// channel; the Cambodia seed adds the Phnom Penh location to the same
// channel. The register sells from Phnom Penh.
jest.setTimeout(240 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Register sales take stock only from the shop (TASKS P2-11)", () => {
      const setup = async (shopStock: number) => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seedInitialData({ container })
        await seed({ container })

        const [store] = await container.resolve(Modules.STORE).listStores({})
        const locations = container.resolve(Modules.STOCK_LOCATION)
        const [shop] = await locations.listStockLocations({ name: "Phnom Penh" })
        const [warehouse] = await locations.listStockLocations({ name: "European Warehouse" })
        const {
          data: [variant],
        } = await query.graph({ entity: "product_variant", fields: ["id"], filters: { sku: "SHIRT-L-BLACK" } })
        await stockAt(container, variant.id, shop.id, shopStock)

        const { result: register } = await createPosRegisterWorkflow(container).run({
          input: {
            name: "Front till",
            code: "PP-1",
            stock_location_id: shop.id,
            sales_channel_id: store.default_sales_channel_id!,
          },
        })
        const { result: shift } = await openPosShiftWorkflow(container).run({
          input: { register_id: register.id, cashier_id: "pcash_1", opening_cash: 0 },
        })
        return { container, query, store, shop, warehouse, variant, register, shift }
      }

      it("takes the sold quantity from the shop's stock and leaves the warehouse untouched", async () => {
        const { container, query, shop, warehouse, variant, shift } = await setup(10)
        const warehouseBefore = await levelAt(container, variant.id, warehouse.id)
        expect(warehouseBefore.stocked).toEqual(1000000)

        const { result } = await posCheckoutWorkflow(container).run({
          input: {
            shift_id: shift.id,
            cashier_id: "pcash_1",
            items: [{ variant_id: variant.id, quantity: 2 }],
            payment_method: "cash",
          },
        })

        // Shop: 10 → 8 on the shelf, nothing left reserved. Warehouse: as before.
        expect(await levelAt(container, variant.id, shop.id)).toEqual({ stocked: 8, reserved: 0 })
        expect(await levelAt(container, variant.id, warehouse.id)).toEqual(warehouseBefore)

        // Handed over at the counter: fulfilled from the shop with the in-store option.
        const {
          data: [order],
        } = await query.graph({
          entity: "order",
          fields: [
            "id",
            "items.id",
            "fulfillments.items.line_item_id",
            "fulfillments.items.quantity",
            "fulfillments.location_id",
            "fulfillments.shipping_option_id",
            "fulfillments.shipping_option.type.code",
          ],
          filters: { id: result.order_id },
        })
        // Every line fully fulfilled: the fulfillment holds each line's whole quantity.
        const fulfilled = (order.fulfillments?.[0]?.items ?? []).map((i) => [i?.line_item_id, Number(i?.quantity)])
        expect(fulfilled).toEqual([[order.items?.[0]?.id, 2]])
        expect(order.fulfillments).toHaveLength(1)
        expect(order.fulfillments?.[0]?.location_id).toEqual(shop.id)
        expect(order.fulfillments?.[0]?.shipping_option?.type?.code).toEqual(POS_IN_STORE_CODE)

        // A second sale reuses the same in-store option.
        await posCheckoutWorkflow(container).run({
          input: {
            shift_id: shift.id,
            cashier_id: "pcash_1",
            items: [{ variant_id: variant.id, quantity: 3 }],
            payment_method: "card",
          },
        })
        expect(await levelAt(container, variant.id, shop.id)).toEqual({ stocked: 5, reserved: 0 })
        expect(await levelAt(container, variant.id, warehouse.id)).toEqual(warehouseBefore)
        const { data: options } = await query.graph({
          entity: "shipping_option",
          fields: ["id", "type.code"],
        })
        expect(options.filter((o) => o?.type?.code === POS_IN_STORE_CODE)).toHaveLength(1)
      })

      it("refuses a sale the shop can't cover, even with stock in the warehouse; nothing changes", async () => {
        const { container, shop, warehouse, variant, shift } = await setup(1)
        const orders = container.resolve(Modules.ORDER)
        const [, ordersBefore] = await orders.listAndCountOrders({})
        const warehouseBefore = await levelAt(container, variant.id, warehouse.id)

        const message = await posCheckoutWorkflow(container)
          .run({
            input: {
              shift_id: shift.id,
              cashier_id: "pcash_1",
              items: [{ variant_id: variant.id, quantity: 2 }],
              payment_method: "cash",
            },
          })
          .then(() => "resolved")
          .catch((e: Error) => e.message)
        expect(message).toContain("Not enough stock at Phnom Penh")
        expect(message).toContain("(1 left)")

        expect(await levelAt(container, variant.id, shop.id)).toEqual({ stocked: 1, reserved: 0 })
        expect(await levelAt(container, variant.id, warehouse.id)).toEqual(warehouseBefore)
        const [, ordersAfter] = await orders.listAndCountOrders({})
        expect(ordersAfter).toEqual(ordersBefore)
      })

      it("rolls the whole sale back when the counter fulfilment fails after the reservations moved", async () => {
        const { container, query, shop, warehouse, variant, shift } = await setup(10)
        // A product on another shipping profile can't be fulfilled with the
        // in-store option (default profile): the fulfilment step fails after
        // the draft, the conversion, the reservation move and the payment.
        const fulfillment = container.resolve(Modules.FULFILLMENT)
        const [bulky] = await fulfillment.createShippingProfiles([{ name: "Bulky", type: "bulky" }])
        const {
          data: [v],
        } = await query.graph({ entity: "product_variant", fields: ["product_id"], filters: { id: variant.id } })
        await updateProductsWorkflow(container).run({
          input: { products: [{ id: v.product_id!, shipping_profile_id: bulky.id }] },
        })

        const orders = container.resolve(Modules.ORDER)
        const [, ordersBefore] = await orders.listAndCountOrders({})
        const shopBefore = await levelAt(container, variant.id, shop.id)
        const warehouseBefore = await levelAt(container, variant.id, warehouse.id)

        const message = await posCheckoutWorkflow(container)
          .run({
            input: {
              shift_id: shift.id,
              cashier_id: "pcash_1",
              items: [{ variant_id: variant.id, quantity: 2 }],
              payment_method: "cash",
            },
          })
          .then(() => "resolved")
          .catch((e: Error) => e.message)
        expect(message).toContain("Shipping profile")

        // Nothing sold, nothing reserved anywhere, no order left behind.
        expect(await levelAt(container, variant.id, shop.id)).toEqual(shopBefore)
        expect(await levelAt(container, variant.id, warehouse.id)).toEqual(warehouseBefore)
        expect(await container.resolve(Modules.INVENTORY).listReservationItems({})).toEqual([])
        const [, ordersAfter] = await orders.listAndCountOrders({})
        expect(ordersAfter).toEqual(ordersBefore)
      })

      it("keeps the in-store option out of the online checkout", async () => {
        const { container, query, store } = await setup(10)
        const {
          data: [key],
        } = await query.graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        const headers = { headers: { "x-publishable-api-key": key.token } }
        const {
          data: [region],
        } = await query.graph({ entity: "region", fields: ["id"], filters: { name: "Cambodia" } })
        const {
          data: { cart },
        } = await api.post(
          "/store/carts",
          {
            region_id: region.id,
            sales_channel_id: store.default_sales_channel_id,
            shipping_address: { country_code: "kh", city: "Phnom Penh", address_1: "St 310", first_name: "A", last_name: "B" },
          },
          headers
        )
        const {
          data: { shipping_options },
        } = await api.get(`/store/shipping-options?cart_id=${cart.id}`, headers)
        const names = shipping_options.map((o: { name: string }) => o.name)
        expect(names).toContain("Phnom Penh Delivery")
        expect(names).not.toContain("In store (POS)")
        // ... although it exists for the register's location.
        const pos = container.resolve<PosModuleService>(POS_MODULE)
        expect(await pos.listPosRegisters({})).toHaveLength(1)
        const { data: options } = await query.graph({ entity: "shipping_option", fields: ["name", "type.code"] })
        expect(options.map((o) => o?.name)).toContain("In store (POS)")
      })
    })
  },
})
