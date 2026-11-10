import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
  linkProductsToSalesChannelWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import { SELLER_MODULE } from "../../src/modules/seller"
import SellerModuleService from "../../src/modules/seller/service"
import { createSellerWorkflow } from "../../src/workflows/seller/create-seller"
import { recordSellerCommissionWorkflow } from "../../src/workflows/seller/record-commission"

jest.setTimeout(240 * 1000)

// TASKS P5-04 (plan §6.5), with the acceptance tests P5-09 and P5-10: an
// order in an active seller's channel creates exactly one commission, even
// when the event is processed twice; orders in your own channel create none.
// Cancelling the order cancels it; a refund recalculates it.
medusaIntegrationTestRunner({
  env: { RESELLER_DEFAULT_COMMISSION_RATE: "10" },
  testSuite: ({ api, getContainer }) => {
    describe("seller commissions (TASKS P5-04, P5-09, P5-10)", () => {
      let ownKey: string
      let regionId: string
      let variantId: string
      let admin: { headers: Record<string, string> }

      const sellers = () => getContainer().resolve<SellerModuleService>(SELLER_MODULE)
      const commissionsOf = (orderId: string) =>
        sellers().listSellerCommissions({ order_id: orderId })
      // The subscribers run after the event, asynchronously.
      const eventually = async <T>(read: () => Promise<T>, done: (value: T) => boolean) => {
        let value = await read()
        for (let i = 0; i < 40 && !done(value); i++) {
          await new Promise((resolve) => setTimeout(resolve, 250))
          value = await read()
        }
        return value
      }

      // A guest buys one T-shirt with the given publishable key.
      const placeOrder = async (key: string) => {
        const store = { headers: { "x-publishable-api-key": key } }
        const {
          data: { cart },
        } = await api.post(
          "/store/carts",
          { region_id: regionId, items: [{ variant_id: variantId, quantity: 2 }] },
          store
        )
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
        await api.post(
          `/store/carts/${cart.id}`,
          { shipping_address: address, billing_address: address, email: "buyer@shop.test" },
          store
        )
        const {
          data: { shipping_options },
        } = await api.get(`/store/shipping-options?cart_id=${cart.id}`, store)
        await api.post(
          `/store/carts/${cart.id}/shipping-methods`,
          { option_id: shipping_options[0].id },
          store
        )
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart.id }, store)
        await api.post(
          `/store/payment-collections/${payment_collection.id}/payment-sessions`,
          { provider_id: "pp_system_default" },
          store
        )
        const { data } = await api.post(`/store/carts/${cart.id}/complete`, {}, store)
        expect(data.type).toEqual("order")
        return data.order as { id: string; total: number; currency_code: string }
      }

      // An active seller whose channel sells the T-shirt.
      const sellerSelling = async (
        handle: string,
        fields: { commission_rate?: number | null; status?: "pending" | "active" | "suspended" } = {}
      ) => {
        const { result } = await createSellerWorkflow(getContainer()).run({
          input: {
            handle,
            name: handle,
            email: `${handle}@seller.test`,
            status: "active",
            ...fields,
          },
        })
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const {
          data: [variant],
        } = await query.graph({
          entity: "variant",
          fields: ["product_id"],
          filters: { id: variantId },
        })
        await linkProductsToSalesChannelWorkflow(getContainer()).run({
          input: { id: result.sales_channel.id, add: [String(variant.product_id)] },
        })
        return result
      }

      beforeEach(async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seedInitialData({ container })
        await seed({ container })

        const {
          data: [key],
        } = await query.graph({
          entity: "api_key",
          fields: ["token"],
          filters: { type: "publishable" },
        })
        ownKey = key.token
        const {
          data: [region],
        } = await query.graph({
          entity: "region",
          fields: ["id"],
          filters: { name: "Cambodia" },
        })
        regionId = region.id
        const { data } = await api.get(
          "/store/products?handle=t-shirt&fields=variants.id",
          { headers: { "x-publishable-api-key": ownKey } }
        )
        variantId = data.products[0].variants[0].id

        const email = "admin@shop.test"
        const user = await container.resolve(Modules.USER).createUsers({ email })
        await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { user_id: user.id },
        })
        await container
          .resolve(Modules.AUTH)
          .updateProvider("emailpass", { entity_id: email, password: "supersecret1" })
        const { data: login } = await api.post("/auth/user/emailpass", {
          email,
          password: "supersecret1",
        })
        admin = { headers: { authorization: `Bearer ${login.token}` } }
      })

      it("P5-09: an order in an active seller's channel earns exactly one commission", async () => {
        const seller = await sellerSelling("sok-shop", { commission_rate: 12.5 })
        const order = await placeOrder(seller.publishable_key.token)

        const [commission] = await eventually(
          () => commissionsOf(order.id),
          (list) => list.length > 0
        )
        expect(commission).toEqual(
          expect.objectContaining({
            seller_id: seller.seller.id,
            order_total: order.total,
            rate: 12.5,
            amount: Math.round(order.total * 12.5) / 100,
            currency_code: order.currency_code,
            status: "pending",
          })
        )

        // The event processed again, and three times at once: still one.
        await recordSellerCommissionWorkflow(getContainer()).run({ input: { order_id: order.id } })
        await Promise.all(
          [1, 2, 3].map(() =>
            recordSellerCommissionWorkflow(getContainer()).run({ input: { order_id: order.id } })
          )
        )
        await getContainer()
          .resolve(Modules.EVENT_BUS)
          .emit({ name: "order.placed", data: { id: order.id } })
        await new Promise((resolve) => setTimeout(resolve, 1000))
        expect(await commissionsOf(order.id)).toHaveLength(1)
      })

      it("a seller without a rate earns the shop default", async () => {
        const seller = await sellerSelling("default-rate", { commission_rate: null })
        const order = await placeOrder(seller.publishable_key.token)
        const [commission] = await eventually(
          () => commissionsOf(order.id),
          (list) => list.length > 0
        )
        expect(commission.rate).toEqual(10)
        expect(commission.amount).toEqual(Math.round(order.total * 10) / 100)
      })

      it("P5-10: orders in your own channel, or a pending or suspended seller's, earn none", async () => {
        const own = await placeOrder(ownKey)
        const pending = await sellerSelling("pending-shop", { status: "pending" })
        const suspended = await sellerSelling("suspended-shop", { status: "suspended" })
        const orders = [
          own,
          await placeOrder(pending.publishable_key.token),
          await placeOrder(suspended.publishable_key.token),
        ]

        await new Promise((resolve) => setTimeout(resolve, 2000))
        for (const order of orders) {
          const { result } = await recordSellerCommissionWorkflow(getContainer()).run({
            input: { order_id: order.id },
          })
          expect(result.commission).toBeNull()
          expect(await commissionsOf(order.id)).toEqual([])
        }
      })

      it("cancelling the order cancels its commission", async () => {
        const seller = await sellerSelling("cancel-shop")
        const order = await placeOrder(seller.publishable_key.token)
        await eventually(() => commissionsOf(order.id), (list) => list.length > 0)

        await api.post(`/admin/orders/${order.id}/cancel`, {}, admin)
        const [commission] = await eventually(
          () => commissionsOf(order.id),
          (list) => list[0]?.status === "cancelled"
        )
        expect(commission.status).toEqual("cancelled")
      })

      it("a partial refund recalculates the commission; a full refund cancels it", async () => {
        const seller = await sellerSelling("refund-shop")
        const order = await placeOrder(seller.publishable_key.token)
        await eventually(() => commissionsOf(order.id), (list) => list.length > 0)

        const {
          data: { order: adminOrder },
        } = await api.get(
          `/admin/orders/${order.id}?fields=payment_collections.payments.id`,
          admin
        )
        const paymentId = adminOrder.payment_collections[0].payments[0].id
        await api.post(`/admin/payments/${paymentId}/capture`, {}, admin)

        const partial = Math.round(order.total * 50) / 100
        await api.post(`/admin/payments/${paymentId}/refund`, { amount: partial }, admin)
        const expected = Math.round((order.total - partial) * 10) / 100
        const [afterPartial] = await eventually(
          () => commissionsOf(order.id),
          (list) => Number(list[0]?.amount) === expected
        )
        expect(afterPartial.amount).toEqual(expected)
        expect(afterPartial.status).toEqual("pending")

        await api.post(
          `/admin/payments/${paymentId}/refund`,
          { amount: Math.round((order.total - partial) * 100) / 100 },
          admin
        )
        const [afterFull] = await eventually(
          () => commissionsOf(order.id),
          (list) => list[0]?.status === "cancelled"
        )
        expect(afterFull.status).toEqual("cancelled")
      })
    })
  },
})
