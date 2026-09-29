import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"

// P1-07 acceptance test (plan §6.1): browse → cart → checkout → order visible
// in admin, through the same store and admin APIs the storefront and the
// dashboard use. Data as on staging: the starter's demo products
// (seed-initial-data) plus the Cambodia shop (seed). Payment is Medusa's
// system provider (`pp_system_default`) until ABA PayWay lands (P1-03).
// Admin auth as in Medusa's docs "Write Integration Tests for API Routes"
// (user + auth identity + JWT signed with the default test secret).
// Customer bot settings for the Telegram steps (P1-17); no bot token, so its
// channel only logs.
process.env.TELEGRAM_CUSTOMER_BOT_USERNAME = "nokor24_shop_bot"
process.env.TELEGRAM_CUSTOMER_WEBHOOK_SECRET = "test_webhook_secret"
jest.setTimeout(180 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("checkout acceptance (TASKS P1-07)", () => {
      it("a Cambodian guest buys a T-shirt and the order shows in the admin", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)

        // Staging's setup: first-boot defaults, demo catalog, Cambodia shop.
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
        const store = { headers: { "x-publishable-api-key": key.token } }
        const {
          data: [region],
        } = await query.graph({
          entity: "region",
          fields: ["id"],
          filters: { name: "Cambodia" },
        })

        // 1. Browse: the T-shirt is listed with a USD price for Cambodia.
        const { data: browse } = await api.get(
          `/store/products?handle=t-shirt&region_id=${region.id}&fields=*variants.calculated_price,*variants.options`,
          store
        )
        const product = browse.products[0]
        expect(product.title).toEqual("Medusa T-Shirt")
        const variant = product.variants.find((v) => v.title === "L / White")
        expect(variant.calculated_price.currency_code).toEqual("usd")
        const unitPrice = variant.calculated_price.calculated_amount

        // 2. Cart: add one.
        const {
          data: { cart },
        } = await api.post("/store/carts", { region_id: region.id }, store)
        await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: variant.id, quantity: 1 },
          store
        )

        // 3. Address and contact, as the Cambodian checkout sends them:
        // phone required, no email, optional Telegram contact (P1-14–P1-16).
        const address = {
          first_name: "Tola",
          last_name: "Kang",
          address_1: "#111, St 310",
          province: "Phnom Penh",
          city: "Khan Chamkar Mon",
          postal_code: "120100",
          country_code: "kh",
          phone: "012 345 678",
        }
        await api.post(
          `/store/carts/${cart.id}`,
          {
            shipping_address: address,
            billing_address: address,
            email: null,
            metadata: { telegram_contact: "@tola_kang" },
          },
          store
        )

        // 4. Delivery: Phnom Penh Delivery is offered and chosen.
        const {
          data: { shipping_options },
        } = await api.get(`/store/shipping-options?cart_id=${cart.id}`, store)
        const delivery = shipping_options.find((o) => o.name === "Phnom Penh Delivery")
        expect(delivery).toBeDefined()
        await api.post(
          `/store/carts/${cart.id}/shipping-methods`,
          { option_id: delivery.id },
          store
        )

        // 5. Payment session with the system provider.
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart.id }, store)
        await api.post(
          `/store/payment-collections/${payment_collection.id}/payment-sessions`,
          { provider_id: "pp_system_default" },
          store
        )

        // 6. Place the order.
        const { data: completed } = await api.post(`/store/carts/${cart.id}/complete`, {}, store)
        expect(completed.type).toEqual("order")
        const orderId = completed.order.id

        // 7. The order is visible in the admin, with what the shop needs.
        const userService = container.resolve(Modules.USER)
        const authService = container.resolve(Modules.AUTH)
        const user = await userService.createUsers({ email: "admin@example.com" })
        const authIdentity = await authService.createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: "admin@example.com" }],
          app_metadata: { user_id: user.id },
        })
        const token = jwt.sign(
          { actor_id: user.id, actor_type: "user", auth_identity_id: authIdentity.id },
          "supersecret",
          { expiresIn: "1d" }
        )
        const admin = { headers: { authorization: `Bearer ${token}` } }

        const { data: list } = await api.get("/admin/orders?fields=id,display_id", admin)
        expect(list.orders.map((o) => o.id)).toContain(orderId)

        const {
          data: { order },
        } = await api.get(
          `/admin/orders/${orderId}?fields=*items,*shipping_address,*shipping_methods,email,total,metadata`,
          admin
        )
        expect(order.email).toBeNull()
        expect(order.items.map((i) => [i.title, i.variant_title, i.quantity])).toEqual([
          ["Medusa T-Shirt", "L / White", 1],
        ])
        expect(order.shipping_address).toMatchObject({
          province: "Phnom Penh",
          city: "Khan Chamkar Mon",
          postal_code: "120100",
          phone: "012 345 678",
        })
        expect(order.shipping_methods.map((m) => m.name)).toEqual(["Phnom Penh Delivery"])
        expect(order.metadata).toMatchObject({ telegram_contact: "@tola_kang" })
        expect(order.total).toBeGreaterThan(unitPrice)

        // 8. Staff get the Telegram alert (local provider in tests); no
        // customer email because there is no email (P1-16).
        let channels: string[] = []
        for (let i = 0; i < 20 && !channels.length; i++) {
          const { data } = await query.graph({
            entity: "notification",
            fields: ["channel"],
            filters: { resource_id: orderId },
          })
          channels = data.map((n) => n.channel)
          if (!channels.length) await new Promise((r) => setTimeout(r, 250))
        }
        expect(channels).toEqual(["telegram"])

        // 9. Telegram updates (P1-17): the order page's button links the
        // customer's chat; the bot confirms, then reports shipping and delivery
        // when staff fulfil the order in the admin.
        const { data: link } = await api.get(`/store/orders/${orderId}/telegram-link`, store)
        const chat = { id: 987654321, type: "private" }
        await api.post(
          "/telegram/webhook",
          { update_id: 1, message: { text: `/start ${new URL(link.url).searchParams.get("start")}`, chat } },
          { headers: { "x-telegram-bot-api-secret-token": "test_webhook_secret" } }
        )

        const {
          data: { order: fulfilled },
        } = await api.post(
          `/admin/orders/${orderId}/fulfillments?fields=*fulfillments`,
          { items: order.items.map((i) => ({ id: i.id, quantity: i.quantity })) },
          admin
        )
        const fulfillmentId = fulfilled.fulfillments[0].id
        await api.post(
          `/admin/orders/${orderId}/fulfillments/${fulfillmentId}/shipments`,
          { items: order.items.map((i) => ({ id: i.id, quantity: i.quantity })) },
          admin
        )
        await api.post(
          `/admin/orders/${orderId}/fulfillments/${fulfillmentId}/mark-as-delivered`,
          {},
          admin
        )

        const expected = [
          "order-confirmed-customer",
          "order-delivered-customer",
          "order-shipped-customer",
        ]
        let customerTemplates: string[] = []
        for (let i = 0; i < 20 && customerTemplates.length < expected.length; i++) {
          const { data } = await query.graph({
            entity: "notification",
            fields: ["template", "to"],
            filters: { resource_id: orderId, channel: "telegram_customer" },
          })
          customerTemplates = data
            .filter((n) => n.to === String(chat.id))
            .map((n) => String(n.template))
          if (customerTemplates.length < expected.length) await new Promise((r) => setTimeout(r, 250))
        }
        expect(customerTemplates.sort()).toEqual(expected)
      })
    })
  },
})
