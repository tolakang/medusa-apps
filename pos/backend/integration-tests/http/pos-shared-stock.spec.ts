import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import { posCheckoutWorkflow } from "../../src/workflows/pos-checkout"
import { createPosRegisterWorkflow } from "../../src/workflows/pos-register"
import { openPosShiftWorkflow } from "../../src/workflows/pos-shift"
import { levelAt, stockAt } from "../helpers/pos-stock"

// TASKS P2-09: the online shop (pos/storefront) and the tills sell from the
// same stock. The storefront reads `+variants.inventory_quantity` through the
// Store API with the online channel's publishable key
// (pos/storefront/src/lib/data/products.ts); Medusa counts the stock locations
// of that key's sales channel. Data as on staging: the Phnom Penh shop is in
// the default (online) channel and the register sells from it. The warehouse
// is emptied for the test variant so the shop is its only stock.
jest.setTimeout(240 * 1000)

const address = {
  first_name: "Test",
  last_name: "Customer",
  address_1: "#111, St 310",
  province: "Phnom Penh",
  city: "Khan Chamkar Mon",
  postal_code: "120100",
  country_code: "kh",
  phone: "012 345 678",
}

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Online shop and tills share one stock (TASKS P2-09)", () => {
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
        await stockAt(container, variant.id, warehouse.id, 0)

        const {
          data: [key],
        } = await query.graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        const online = { headers: { "x-publishable-api-key": key.token } }
        const {
          data: [region],
        } = await query.graph({ entity: "region", fields: ["id"], filters: { name: "Cambodia" } })

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

        // What the storefront's product page shows for this variant.
        const onlineStock = async () => {
          const { data } = await api.get(
            `/store/products?handle=t-shirt&region_id=${region.id}&fields=+variants.inventory_quantity,+variants.sku`,
            online
          )
          return data.products[0].variants.find((v: { sku: string }) => v.sku === "SHIRT-L-BLACK").inventory_quantity
        }

        const tillSale = (quantity: number) =>
          posCheckoutWorkflow(container).run({
            input: {
              shift_id: shift.id,
              cashier_id: "pcash_1",
              items: [{ variant_id: variant.id, quantity }],
              payment_method: "cash",
            },
          })

        // An online order, as the storefront's checkout places it.
        const onlineOrder = async (quantity: number) => {
          const {
            data: { cart },
          } = await api.post("/store/carts", { region_id: region.id }, online)
          await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: variant.id, quantity }, online)
          await api.post(`/store/carts/${cart.id}`, { shipping_address: address, billing_address: address }, online)
          const {
            data: { shipping_options },
          } = await api.get(`/store/shipping-options?cart_id=${cart.id}`, online)
          const delivery = shipping_options.find((o: { name: string }) => o.name === "Phnom Penh Delivery")
          await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: delivery.id }, online)
          const {
            data: { payment_collection },
          } = await api.post("/store/payment-collections", { cart_id: cart.id }, online)
          await api.post(
            `/store/payment-collections/${payment_collection.id}/payment-sessions`,
            { provider_id: "pp_system_default" },
            online
          )
          const { data } = await api.post(`/store/carts/${cart.id}/complete`, {}, online)
          return data
        }

        return { container, shop, variant, onlineStock, tillSale, onlineOrder }
      }

      it("the online shop shows the shop's stock, and a till sale lowers it", async () => {
        const { onlineStock, tillSale } = await setup(10)
        expect(await onlineStock()).toEqual(10)

        await tillSale(2)
        expect(await onlineStock()).toEqual(8)
      })

      it("an online order holds stock the till can no longer sell", async () => {
        const { container, shop, variant, onlineStock, tillSale, onlineOrder } = await setup(10)

        const placed = await onlineOrder(3)
        expect(placed.type).toEqual("order")
        // Reserved at the shop (its only stock) until staff ship it.
        expect(await levelAt(container, variant.id, shop.id)).toEqual({ stocked: 10, reserved: 3 })
        expect(await onlineStock()).toEqual(7)

        const message = await tillSale(8)
          .then(() => "resolved")
          .catch((e: Error) => e.message)
        expect(message).toContain("(7 left)")

        await tillSale(7)
        expect(await levelAt(container, variant.id, shop.id)).toEqual({ stocked: 3, reserved: 3 })
        expect(await onlineStock()).toEqual(0)
      })
    })
  },
})
