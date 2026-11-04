import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"
import { addBookingToCartWorkflow } from "../../src/workflows/add-booking-to-cart"

// TASKS P3-06 (BUILD_PLAN §6.3): creating a payment session renews the
// cart's booking holds, so a slow payment doesn't lose the slot.
jest.setTimeout(240 * 1000)

const day = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const STARTS = `${day}T03:00:00.000Z`
const ENDS = `${day}T04:00:00.000Z`
const MINUTE = 60_000

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("hold renewed on payment (TASKS P3-06)", () => {
      let store: { headers: Record<string, string> }
      let regionId: string
      let serviceId: string
      let resourceId: string

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
        } = await query.graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        store = { headers: { "x-publishable-api-key": key.token } }
        const {
          data: [region],
        } = await query.graph({ entity: "region", fields: ["id"], filters: { name: "Cambodia" } })
        regionId = region.id
        const {
          data: [variant],
        } = await query.graph({ entity: "product_variant", fields: ["id"], filters: { title: "L / White" } })
        serviceId = variant.id

        const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
        const resource = await booking.createBookingResources({
          name: "Sophea",
          type: "staff",
          timezone: "Asia/Phnom_Penh",
        })
        await booking.createBookingSchedules(
          [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            resource_id: resource.id,
            weekday,
            start_time: "00:00",
            end_time: "23:59",
          }))
        )
        await container.resolve(ContainerRegistrationKeys.LINK).create({
          [BOOKING_MODULE]: { booking_resource_id: resource.id },
          [Modules.PRODUCT]: { product_variant_id: serviceId },
        })
        resourceId = resource.id
      })

      const booking = () => getContainer().resolve<BookingModuleService>(BOOKING_MODULE)
      const bookedCart = async () => {
        const cart = (await api.post("/store/carts", { region_id: regionId }, store)).data.cart
        const { result } = await addBookingToCartWorkflow(getContainer()).run({
          input: { cart_id: cart.id, variant_id: serviceId, resource_id: resourceId, starts_at: STARTS, ends_at: ENDS },
        })
        return { cartId: cart.id as string, holdId: result.booking.id as string }
      }
      // Contact first (the existing contact check on this route), then pay.
      const startPayment = async (cartId: string) => {
        await api.post(
          `/store/carts/${cartId}`,
          {
            email: "sok@example.com",
            shipping_address: { first_name: "Sok", country_code: "kh", phone: "012 345 678", address_1: "St 310", city: "Phnom Penh" },
          },
          store
        )
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cartId }, store)
        return api.post(
          `/store/payment-collections/${payment_collection.id}/payment-sessions`,
          { provider_id: "pp_system_default" },
          store
        )
      }
      const expiresAt = async (id: string) =>
        new Date((await booking().listBookings({ id }))[0].hold_expires_at!).getTime()

      it("renews a hold that was about to run out for BOOKING_HOLD_MINUTES from now", async () => {
        const { cartId, holdId } = await bookedCart()
        await booking().updateBookings({ id: holdId, hold_expires_at: new Date(Date.now() + MINUTE) })

        const before = Date.now()
        const res = await startPayment(cartId)
        expect(res.status).toEqual(200)

        // Default hold length is 15 minutes (no BOOKING_HOLD_MINUTES in tests).
        const until = await expiresAt(holdId)
        expect(until).toBeGreaterThanOrEqual(before + 15 * MINUTE - 1000)
        expect(until).toBeLessThanOrEqual(Date.now() + 15 * MINUTE + 1000)
      })

      it("doesn't renew a hold whose time was taken, and the payment still starts", async () => {
        const slow = await bookedCart()
        await booking().updateBookings({ id: slow.holdId, hold_expires_at: new Date(Date.now() - MINUTE) })
        const fast = await bookedCart()
        const expiredAt = await expiresAt(slow.holdId)

        const res = await startPayment(slow.cartId)
        expect(res.status).toEqual(200)

        expect(await expiresAt(slow.holdId)).toEqual(expiredAt)
        // The other cart's hold is untouched too.
        expect(await expiresAt(fast.holdId)).toBeGreaterThan(Date.now())
      })
    })
  },
})
