import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seed from "../../src/scripts/seed"
import { SHIPPING_PHONE_REQUIRED_MESSAGE } from "../../src/api/phone-validation"

// Store phone numbers must be digits (src/api/phone-validation.ts). Same
// preconditions as seed.spec.ts; the cart is created through the store API.
jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("store phone validation", () => {
      it("refuses a cart address phone with letters and keeps a valid one", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seed({ container })

        const {
          data: [key],
        } = await query.graph({
          entity: "api_key",
          fields: ["token"],
          filters: { type: "publishable" },
        })
        const headers = { "x-publishable-api-key": key.token }
        const {
          data: [region],
        } = await query.graph({ entity: "region", fields: ["id"] })

        const { data } = await api.post("/store/carts", { region_id: region.id }, { headers })
        const cartId = data.cart.id
        const address = {
          first_name: "Tola",
          last_name: "Kang",
          address_1: "Sihanouk Blvd",
          city: "Phnom Penh",
          country_code: "kh",
          postal_code: "12000",
        }

        const bad = await api
          .post(
            `/store/carts/${cartId}`,
            { shipping_address: { ...address, phone: "44x,fnsdk.jrnk." } },
            { headers }
          )
          .catch((e) => e.response)
        expect(bad.status).toEqual(400)
        expect(bad.data.message).toMatch(/^Shipping address phone: Enter a phone number/)

        const good = await api.post(
          `/store/carts/${cartId}`,
          { shipping_address: { ...address, phone: "+855 12 345 678" } },
          { headers }
        )
        expect(good.status).toEqual(200)
        expect(good.data.cart.shipping_address.phone).toEqual("+855 12 345 678")
      })

      it("refuses to place an order without a delivery phone", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seed({ container })
        const {
          data: [key],
        } = await query.graph({
          entity: "api_key",
          fields: ["token"],
          filters: { type: "publishable" },
        })
        const headers = { "x-publishable-api-key": key.token }
        const {
          data: [region],
        } = await query.graph({ entity: "region", fields: ["id"] })
        const { data } = await api.post("/store/carts", { region_id: region.id }, { headers })
        const cartId = data.cart.id
        const address = {
          first_name: "Tola",
          last_name: "Kang",
          address_1: "St 310",
          city: "Khan Chamkar Mon",
          province: "Phnom Penh",
          country_code: "kh",
        }

        await api.post(`/store/carts/${cartId}`, { shipping_address: address }, { headers })
        const noPhone = await api
          .post(`/store/carts/${cartId}/complete`, {}, { headers })
          .catch((e) => e.response)
        expect(noPhone.status).toEqual(400)
        expect(noPhone.data.message).toEqual(SHIPPING_PHONE_REQUIRED_MESSAGE)

        // With a phone the check passes; completion then stops on Medusa's own
        // checks (the empty test cart has no items or payment).
        await api.post(
          `/store/carts/${cartId}`,
          { shipping_address: { ...address, phone: "012 345 678" } },
          { headers }
        )
        const withPhone = await api
          .post(`/store/carts/${cartId}/complete`, {}, { headers })
          .catch((e) => e.response)
        expect(withPhone.data?.message).not.toEqual(SHIPPING_PHONE_REQUIRED_MESSAGE)
      })
    })
  },
})
