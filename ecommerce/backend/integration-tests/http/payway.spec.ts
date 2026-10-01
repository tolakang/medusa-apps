import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
  updateRegionsWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import { callbackSignature, signPurchase } from "../../src/modules/payway/client"

// ABA PayWay through Medusa's real payment flow (TASKS P1-03). The app runs in
// this process, so only calls to PayWay's servers are faked; everything else
// (store API, payment module, webhook route, cart completion) is real.
// Fake credentials: medusa-config registers pp_payway_payway when these are set.
process.env.PAYWAY_MERCHANT_ID = "ec000002"
process.env.PAYWAY_API_KEY = "test-api-key"
process.env.PAYWAY_RETURN_URL = "https://e-api.nokor24.com/hooks/payment/payway_payway"
process.env.STOREFRONT_URL = "https://e-shop.nokor24.com"
jest.setTimeout(180 * 1000)

const PAYWAY = "https://checkout-sandbox.payway.com.kh"
const realFetch = global.fetch
let paywayStatus: { code: string; status?: number; total?: number } = { code: "6" }
const paywayCalls: { url: string; body: Record<string, unknown> }[] = []

beforeAll(() => {
  global.fetch = (async (input: any, init?: any) => {
    const url = String(input)
    if (!url.startsWith(PAYWAY)) return realFetch(input, init)
    paywayCalls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) })
    const body =
      paywayStatus.code === "00"
        ? {
            data: {
              payment_status_code: paywayStatus.status,
              payment_status: paywayStatus.status === 0 ? "APPROVED" : "PENDING",
              total_amount: paywayStatus.total,
              payment_amount: paywayStatus.total,
              payment_currency: "USD",
              apv: "544415",
            },
            status: { code: "00", message: "Success!" },
          }
        : { status: { code: paywayStatus.code, message: "Transaction not found" } }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch
})
afterAll(() => {
  global.fetch = realFetch
})

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("ABA PayWay checkout (TASKS P1-03)", () => {
      const setup = async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seedInitialData({ container })
        await seed({ container })
        const {
          data: [region],
        } = await query.graph({ entity: "region", fields: ["id"], filters: { name: "Cambodia" } })
        // What the owner does in Settings → Regions → Cambodia.
        await updateRegionsWorkflow(container).run({
          input: {
            selector: { id: region.id },
            update: { payment_providers: ["pp_system_default", "pp_payway_payway"] },
          },
        })
        const {
          data: [key],
        } = await query.graph({
          entity: "api_key",
          fields: ["token"],
          filters: { type: "publishable" },
        })
        const store = { headers: { "x-publishable-api-key": key.token } }

        const { data: products } = await api.get(
          `/store/products?handle=t-shirt&region_id=${region.id}`,
          store
        )
        const variant = products.products[0].variants[0]
        const { data } = await api.post("/store/carts", { region_id: region.id }, store)
        const cartId = data.cart.id
        await api.post(`/store/carts/${cartId}/line-items`, { variant_id: variant.id, quantity: 1 }, store)
        const address = {
          first_name: "Tola",
          last_name: "Kang",
          address_1: "#111",
          province: "Phnom Penh",
          city: "Khan Chamkar Mon",
          country_code: "kh",
          phone: "012 345 678",
        }
        await api.post(`/store/carts/${cartId}`, { shipping_address: address, billing_address: address }, store)
        const {
          data: { shipping_options },
        } = await api.get(`/store/shipping-options?cart_id=${cartId}`, store)
        await api.post(`/store/carts/${cartId}/shipping-methods`, { option_id: shipping_options[0].id }, store)

        // What the storefront's "Pay with ABA PayWay" button does.
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cartId }, store)
        const {
          data: { payment_collection: withSession },
        } = await api.post(
          `/store/payment-collections/${payment_collection.id}/payment-sessions`,
          {
            provider_id: "pp_payway_payway",
            data: { country_code: "kh", firstname: "Tola", lastname: "Kang", phone: "012 345 678" },
          },
          store
        )
        const session = withSession.payment_sessions.find(
          (s) => s.provider_id === "pp_payway_payway"
        )
        return { query, store, cartId, session }
      }

      it("offers PayWay in the Cambodia region and signs the checkout form", async () => {
        const { session, cartId, store } = await setup()
        const {
          data: { cart },
        } = await api.get(`/store/carts/${cartId}`, store)
        const { data } = await api.get(`/store/payment-providers?region_id=${cart.region_id}`, store)
        expect(data.payment_providers.map((p) => p.id)).toEqual(
          expect.arrayContaining(["pp_payway_payway", "pp_system_default"])
        )

        const form = session.data.form as Record<string, string>
        expect(session.data.checkout_url).toEqual(`${PAYWAY}/api/payment-gateway/v1/payments/purchase`)
        expect(form).toMatchObject({ merchant_id: "ec000002", currency: "USD", phone: "012345678" })
        expect(Number(form.amount)).toBeGreaterThan(0)
        expect(JSON.parse(form.return_params)).toEqual({ session_id: session.id })
        const { hash, ...fields } = form
        expect(signPurchase(fields, "test-api-key").hash).toEqual(hash)
      })

      it("places the order only after PayWay confirms the payment", async () => {
        const { session, cartId, store, query } = await setup()

        // Back from PayWay but not paid (yet): no order. Medusa answers 400
        // "…was not authorized with the provider." (NOT_ALLOWED; the
        // storefront's return page waits and asks again).
        paywayStatus = { code: "00", status: 2, total: Number(session.data.amount) }
        const notYet = await api
          .post(`/store/carts/${cartId}/complete`, {}, store)
          .catch((e) => e.response)
        expect(notYet.status).toEqual(400)
        expect(notYet.data.message).toMatch(/was not authorized with the provider/)

        // Paid: the order is placed and the payment is captured.
        paywayStatus = { code: "00", status: 0, total: Number(session.data.amount) }
        const placed = await api.post(`/store/carts/${cartId}/complete`, {}, store)
        expect(placed.data.type).toEqual("order")
        const last = paywayCalls[paywayCalls.length - 1]
        expect(last.url).toContain("/check-transaction-2")
        expect(last.body.tran_id).toEqual(session.data.tran_id)

        const {
          data: [order],
        } = await query.graph({
          entity: "order",
          fields: ["id", "payment_collections.payments.captured_at", "payment_collections.payments.provider_id"],
          filters: { id: placed.data.order.id },
        })
        const payment = order.payment_collections?.[0]?.payments?.[0]
        expect(payment?.provider_id).toEqual("pp_payway_payway")
        expect(payment?.captured_at).toBeTruthy()
      })

      it("places the order from PayWay's signed callback, even if the customer never comes back", async () => {
        const { session, cartId, store, query } = await setup()
        paywayStatus = { code: "00", status: 0, total: Number(session.data.amount) }
        const body = {
          tran_id: session.data.tran_id,
          apv: "544415",
          status: "0",
          return_params: session.data.form.return_params,
          total_amount: Number(session.data.amount),
        }

        // A forged callback does nothing.
        await api.post("/hooks/payment/payway_payway", body, {
          headers: { "x-payway-hmac-sha512": "forged" },
        })
        await new Promise((r) => setTimeout(r, 1500))
        const { data: stillOpen } = await query.graph({
          entity: "cart",
          fields: ["completed_at"],
          filters: { id: cartId },
        })
        expect(stillOpen[0].completed_at).toBeFalsy()

        // The signed one completes the cart.
        await api.post("/hooks/payment/payway_payway", body, {
          headers: { "x-payway-hmac-sha512": callbackSignature(body, "test-api-key") },
        })
        let completedAt: unknown = null
        for (let i = 0; i < 40 && !completedAt; i++) {
          const { data } = await query.graph({
            entity: "cart",
            fields: ["completed_at"],
            filters: { id: cartId },
          })
          completedAt = data[0].completed_at
          if (!completedAt) await new Promise((r) => setTimeout(r, 250))
        }
        expect(completedAt).toBeTruthy()

        // The customer coming back afterwards still lands on the order.
        const again = await api.post(`/store/carts/${cartId}/complete`, {}, store)
        expect(again.data.type).toEqual("order")
      })
    })
  },
})
