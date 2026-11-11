import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import { SELLER_MODULE } from "../../src/modules/seller"
import SellerModuleService from "../../src/modules/seller/service"
import { commissionAmount, commissionBase } from "../../src/modules/seller/commission"

jest.setTimeout(240 * 1000)

// TASKS P5-08: GET /sellers/me/orders, the portal's "sales": orders in the
// seller's channel with their commission, no customer details.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("GET /sellers/me/orders (TASKS P5-08)", () => {
      let admin: { headers: Record<string, string> }
      let ownKey: string
      let regionId: string
      const call = (p: Promise<any>) => p.then((r) => r, (e) => e.response)
      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } })

      const sellerLogin = async (handle: string) => {
        const email = `${handle}@seller.test`
        const invited = await api.post("/admin/sellers", { handle, name: handle, email, status: "active" }, admin)
        const reg = await api.post("/auth/seller/emailpass/register", { email, password: "seller-pass-1" })
        await api.post(
          "/sellers/accept",
          { invite_code: invited.data.invite_code },
          bearer(reg.data.token)
        )
        const { data } = await api.post("/auth/seller/emailpass", { email, password: "seller-pass-1" })
        return { id: invited.data.seller.id as string, key: invited.data.publishable_key as string, auth: bearer(data.token) }
      }

      const placeOrder = async (key: string, variantId: string) => {
        const store = { headers: { "x-publishable-api-key": key } }
        const { data: { cart } } = await api.post(
          "/store/carts",
          { region_id: regionId, items: [{ variant_id: variantId, quantity: 1 }] },
          store
        )
        const address = {
          first_name: "Test", last_name: "Customer", address_1: "#111, St 310", province: "Phnom Penh",
          city: "Khan Chamkar Mon", postal_code: "120100", country_code: "kh", phone: "012 345 678",
        }
        await api.post(`/store/carts/${cart.id}`, { shipping_address: address, billing_address: address, email: "buyer@shop.test" }, store)
        const { data: { shipping_options } } = await api.get(`/store/shipping-options?cart_id=${cart.id}`, store)
        await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: shipping_options[0].id }, store)
        const { data: { payment_collection } } = await api.post("/store/payment-collections", { cart_id: cart.id }, store)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, store)
        const { data } = await api.post(`/store/carts/${cart.id}/complete`, {}, store)
        return data.order as { id: string; total: number }
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
        const { data: [key] } = await query.graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        ownKey = key.token
        const { data: [region] } = await query.graph({ entity: "region", fields: ["id"], filters: { name: "Cambodia" } })
        regionId = region.id

        const email = "admin@shop.test"
        const user = await container.resolve(Modules.USER).createUsers({ email })
        await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { user_id: user.id },
        })
        await container.resolve(Modules.AUTH).updateProvider("emailpass", { entity_id: email, password: "supersecret1" })
        const { data } = await api.post("/auth/user/emailpass", { email, password: "supersecret1" })
        admin = { headers: { authorization: `Bearer ${data.token}` } }
      })

      it("lists the seller's orders with their commission, and nothing else", async () => {
        const sok = await sellerLogin("sok")
        const dara = await sellerLogin("dara")
        const { data: { products } } = await api.get("/sellers/me/products", sok.auth)
        const tShirt = products.find((p) => p.handle === "t-shirt")
        await api.post("/sellers/me/products", { add: [tShirt.id] }, sok.auth)
        await api.post("/sellers/me/products", { add: [tShirt.id] }, dara.auth)
        const { data: catalog } = await api.get("/store/products?handle=t-shirt&fields=variants.id", {
          headers: { "x-publishable-api-key": ownKey },
        })
        const variantId = catalog.products[0].variants[0].id

        const order = await placeOrder(sok.key, variantId)
        await placeOrder(dara.key, variantId)
        await placeOrder(ownKey, variantId)

        // The commission is recorded by the order.placed subscriber.
        const sellers = getContainer().resolve<SellerModuleService>(SELLER_MODULE)
        for (let i = 0; i < 40 && !(await sellers.listSellerCommissions({ order_id: order.id })).length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 250))
        }

        // Commission on the items only (D11, TASKS P5-12).
        const {
          data: [totals],
        } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({
            entity: "order",
            fields: ["item_total", "item_tax_total"],
            filters: { id: order.id },
          })

        const { data } = await api.get("/sellers/me/orders", sok.auth)
        expect(data.count).toEqual(1)
        expect(data.orders[0]).toEqual({
          id: order.id,
          display_id: expect.any(Number),
          created_at: expect.any(String),
          status: "pending",
          currency_code: "usd",
          total: order.total,
          items: [{ title: expect.any(String), quantity: 1 }],
          commission: { amount: commissionAmount(commissionBase(totals), 10), status: "pending" },
        })
        expect(JSON.stringify(data)).not.toContain("buyer@shop.test")
        expect(JSON.stringify(data)).not.toContain("012 345 678")

        expect((await api.get("/sellers/me/orders", dara.auth)).data.count).toEqual(1)
        expect((await call(api.get("/sellers/me/orders?limit=0", sok.auth))).status).toEqual(400)
        expect((await call(api.get("/sellers/me/orders"))).status).toEqual(401)
      })
    })
  },
})
