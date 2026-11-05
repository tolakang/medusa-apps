import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seed from "../../src/scripts/seed"
import seedBookingDemo from "../../src/scripts/seed-booking-demo"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"

// TASKS P3-12 (BUILD_PLAN §6.3): a service is a product with no shipping
// profile and variants without inventory, so a cart with only services is
// checked out without an address or a shipping method. Data from the
// Cambodia seed plus the booking demo seed (Haircut 30 / 60 min, Sophea).
jest.setTimeout(240 * 1000)

// The next Monday at least 7 days ahead (Sophea works Monday to Saturday).
const monday = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
})()

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("services without shipping (TASKS P3-12)", () => {
      let store: { headers: Record<string, string> }
      let regionId: string
      let variants: Record<string, string>

      beforeEach(async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        process.env.BOOKING_DEFAULT_TIMEZONE = "Asia/Phnom_Penh"
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seed({ container })
        await seedBookingDemo({ container })
        const {
          data: [key],
        } = await query.graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        store = { headers: { "x-publishable-api-key": key.token } }
        const {
          data: [region],
        } = await query.graph({ entity: "region", fields: ["id"], filters: { name: "Cambodia" } })
        regionId = region.id
        const { data } = await query.graph({
          entity: "product_variant",
          fields: ["id", "title"],
          filters: { sku: ["HAIRCUT-30", "HAIRCUT-60"] },
        })
        variants = Object.fromEntries(data.map((v) => [v.title, v.id]))
      })

      it("seeds a published service without a shipping profile, once", async () => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const {
          data: [product],
        } = await query.graph({
          entity: "product",
          fields: ["title", "status", "shipping_profile.id", "variants.manage_inventory", "variants.metadata", "variants.booking_resources.name"],
          filters: { handle: "haircut" },
        })
        expect(product).toMatchObject({ title: "Haircut", status: "published" })
        expect(product.shipping_profile ?? null).toBeNull()
        expect(product.variants!.map((v) => [v!.manage_inventory, v!.metadata?.duration_minutes, v!.booking_resources!.map((r) => r!.name)]).sort()).toEqual([
          [false, 30, ["Sophea"]],
          [false, 60, ["Sophea"]],
        ])

        await seedBookingDemo({ container: getContainer() })
        const { data: again } = await query.graph({ entity: "product", fields: ["id"], filters: { handle: "haircut" } })
        expect(again).toHaveLength(1)
      })

      it("offers slots of the variant's length by default", async () => {
        const slots = async (variant: string) =>
          (await api.get(`/store/booking/slots?variant_id=${variants[variant]}&date=${monday}`, store)).data
        const long = await slots("60 min")
        const short = await slots("30 min")
        // 09:00-12:00 and 13:00-17:00 local: 7 hours → 7 one-hour or 14 half-hour slots.
        expect(long).toMatchObject({ duration_minutes: 60 })
        expect(long.slots).toHaveLength(7)
        expect(short).toMatchObject({ duration_minutes: 30 })
        expect(short.slots).toHaveLength(14)
        expect(long.slots[0]).toMatchObject({ resource_name: "Sophea", starts_at: `${monday}T02:00:00.000Z` })
      })

      it("checks out a service-only cart with no address and no shipping method", async () => {
        const cart = (await api.post("/store/carts", { region_id: regionId }, store)).data.cart
        const {
          data: { slots },
        } = await api.get(`/store/booking/slots?variant_id=${variants["60 min"]}&date=${monday}`, store)
        const { data: added } = await api.post(
          "/store/booking/cart",
          {
            cart_id: cart.id,
            variant_id: variants["60 min"],
            resource_id: slots[0].resource_id,
            starts_at: slots[0].starts_at,
            ends_at: slots[0].ends_at,
          },
          store
        )
        const {
          data: { cart: withItem },
        } = await api.get(`/store/carts/${cart.id}`, store)
        expect(withItem.items.map((i) => [i.title, i.requires_shipping, i.unit_price])).toEqual([["Haircut", false, 15]])

        // No delivery: no courier phone asked for, but one way to reach the customer.
        const noContact = await api.post(`/store/carts/${cart.id}/complete`, {}, store).catch((e) => e.response)
        expect(noContact.data.message).toEqual(
          "Add an email address or a phone number so we can reach you about your booking."
        )
        await api.post(`/store/carts/${cart.id}`, { email: "sok@example.com" }, store)
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
        expect(data.order.shipping_methods ?? []).toEqual([])
        expect(data.order.total).toEqual(15)

        // The order.placed subscriber confirms the booking (P3-07).
        const booking = getContainer().resolve<BookingModuleService>(BOOKING_MODULE)
        let status = ""
        for (let i = 0; i < 40 && status !== "confirmed"; i++) {
          status = (await booking.listBookings({ id: added.booking.id }))[0].status
          if (status !== "confirmed") await new Promise((r) => setTimeout(r, 250))
        }
        expect(status).toEqual("confirmed")
      })
    })
  },
})
