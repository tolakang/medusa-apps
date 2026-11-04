import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  capturePaymentWorkflow,
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"
import { addBookingToCartWorkflow } from "../../src/workflows/add-booking-to-cart"
import { cancelBookingWorkflow } from "../../src/workflows/cancel-booking"

// TASKS P3-08 (BUILD_PLAN §6.3) and the P3-16 acceptance criterion:
// cancellation inside the policy (BOOKING_CANCEL_HOURS, default 24) refunds;
// outside it doesn't.
jest.setTimeout(300 * 1000)

const day = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const STARTS = `${day}T03:00:00.000Z`
const ENDS = `${day}T04:00:00.000Z`

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("cancel-booking (TASKS P3-08, P3-16)", () => {
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
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const refused = (message: string) => ({ message: expect.stringContaining(message) })

      const bookedCart = async () => {
        const cart = (await api.post("/store/carts", { region_id: regionId }, store)).data.cart
        const { result } = await addBookingToCartWorkflow(getContainer()).run({
          input: { cart_id: cart.id, variant_id: serviceId, resource_id: resourceId, starts_at: STARTS, ends_at: ENDS },
        })
        return { cartId: cart.id as string, bookingId: result.booking.id as string }
      }
      // Full checkout with the system provider; returns the order, the
      // booking and the order's payment.
      const placed = async ({ capture }: { capture: boolean }) => {
        const { cartId, bookingId } = await bookedCart()
        const address = {
          first_name: "Sok",
          last_name: "Dara",
          address_1: "#111, St 310",
          province: "Phnom Penh",
          city: "Khan Chamkar Mon",
          postal_code: "120100",
          country_code: "kh",
          phone: "012 345 678",
        }
        await api.post(`/store/carts/${cartId}`, { shipping_address: address, billing_address: address, email: "sok@example.com" }, store)
        const {
          data: { shipping_options },
        } = await api.get(`/store/shipping-options?cart_id=${cartId}`, store)
        await api.post(`/store/carts/${cartId}/shipping-methods`, { option_id: shipping_options.find((o) => o.name === "Phnom Penh Delivery").id }, store)
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cartId }, store)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, store)
        const { data } = await api.post(`/store/carts/${cartId}/complete`, {}, store)
        const orderId = data.order.id as string

        // Wait for the order.placed subscriber (P3-07) to confirm and link.
        for (let i = 0; i < 40; i++) {
          const [b] = await booking().listBookings({ id: bookingId })
          if (b.status === "confirmed") break
          await new Promise((r) => setTimeout(r, 250))
        }
        const {
          data: [order],
        } = await query().graph({
          entity: "order",
          fields: ["id", "total", "items.total", "items.unit_price", "items.metadata", "payment_collections.payments.id"],
          filters: { id: orderId },
        })
        const paymentId = order.payment_collections![0]!.payments![0]!.id
        if (capture) {
          await capturePaymentWorkflow(getContainer()).run({ input: { payment_id: paymentId } })
        }
        const item = order.items!.find((i) => i?.metadata?.booking_id === bookingId)!
        const itemTotal = Number(item.total)
        // No tax rate in the Cambodia seed and no promotion: total = unit price.
        expect(itemTotal).toEqual(Number(item.unit_price))
        return { orderId, bookingId, paymentId, itemTotal }
      }
      const refundsOf = async (paymentId: string) => {
        const {
          data: [payment],
        } = await query().graph({ entity: "payment", fields: ["id", "refunds.amount", "refunds.note"], filters: { id: paymentId } })
        return (payment.refunds ?? []).map((r) => ({ amount: Number(r!.amount), note: r!.note }))
      }
      const slotFree = () =>
        booking().isSlotAvailable({ resource_id: resourceId, starts_at: new Date(STARTS), ends_at: new Date(ENDS) })

      it("P3-16: inside the policy, cancels and refunds the booking's order item", async () => {
        const { bookingId, paymentId, itemTotal } = await placed({ capture: true })
        expect(itemTotal).toBeGreaterThan(0)

        const { result } = await cancelBookingWorkflow(getContainer()).run({ input: { booking_id: bookingId } })

        expect(result).toMatchObject({ refund: "refunded", refunded_amount: itemTotal })
        expect(result.booking).toMatchObject({ status: "cancelled", hold_expires_at: null })
        expect(await refundsOf(paymentId)).toEqual([
          { amount: itemTotal, note: `Booking ${bookingId} cancelled within the cancellation policy.` },
        ])
        expect(await slotFree()).toBe(true)
      })

      it("P3-16: outside the policy, cancels without a refund", async () => {
        const { bookingId, paymentId } = await placed({ capture: true })
        // Move the booking to start in 2 hours: inside the last 24 hours.
        const soon = Date.now() + 2 * 3600 * 1000
        await booking().updateBookings({
          id: bookingId,
          starts_at: new Date(soon),
          ends_at: new Date(soon + 3600 * 1000),
        })

        const { result } = await cancelBookingWorkflow(getContainer()).run({ input: { booking_id: bookingId } })

        expect(result).toMatchObject({ refund: "outside_policy", refunded_amount: 0 })
        expect(result.booking.status).toEqual("cancelled")
        expect(await refundsOf(paymentId)).toEqual([])
      })

      it("cancels without a refund when the payment isn't captured yet", async () => {
        const { bookingId, paymentId } = await placed({ capture: false })

        const { result } = await cancelBookingWorkflow(getContainer()).run({ input: { booking_id: bookingId } })

        expect(result).toMatchObject({ refund: "not_captured", refunded_amount: 0 })
        expect(await refundsOf(paymentId)).toEqual([])
      })

      it("cancels a hold that has no order; nothing to refund", async () => {
        const { bookingId } = await bookedCart()

        const { result } = await cancelBookingWorkflow(getContainer()).run({ input: { booking_id: bookingId } })

        expect(result).toMatchObject({ refund: "no_order", refunded_amount: 0 })
        expect(await slotFree()).toBe(true)
      })

      it("refuses another customer's booking, a second cancel and a started booking", async () => {
        const { bookingId } = await placed({ capture: true })
        const [b] = await booking().listBookings({ id: bookingId })

        await expect(
          cancelBookingWorkflow(getContainer()).run({ input: { booking_id: bookingId, customer_id: "cus_someone_else" } })
        ).rejects.toMatchObject(refused("was not found"))
        expect((await booking().listBookings({ id: bookingId }))[0].status).toEqual("confirmed")

        await cancelBookingWorkflow(getContainer()).run({ input: { booking_id: bookingId, customer_id: b.customer_id ?? undefined } })
        await expect(
          cancelBookingWorkflow(getContainer()).run({ input: { booking_id: bookingId } })
        ).rejects.toMatchObject(refused("This booking can't be cancelled."))

        const started = await booking().createBookings({
          resource_id: resourceId,
          starts_at: new Date(Date.now() - 3600 * 1000),
          ends_at: new Date(Date.now() + 3600 * 1000),
          status: "confirmed",
        })
        await expect(
          cancelBookingWorkflow(getContainer()).run({ input: { booking_id: started.id } })
        ).rejects.toMatchObject(refused("This booking has already started."))
      })
    })
  },
})
