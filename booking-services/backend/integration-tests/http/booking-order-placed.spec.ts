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
import { confirmOrderBookingsWorkflow } from "../../src/workflows/confirm-order-bookings"

// TASKS P3-07 (BUILD_PLAN §6.3): the order.placed subscriber confirms the
// order's bookings and links them to the order; running it again changes
// nothing.
jest.setTimeout(240 * 1000)

const day = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const slot = (h: number) => ({
  starts_at: `${day}T0${h}:00:00.000Z`,
  ends_at: `${day}T0${h + 1}:00:00.000Z`,
})

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("bookings confirmed when the order is placed (TASKS P3-07)", () => {
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

      // Cart with one booking per slot, then a full system-payment checkout.
      const checkout = async (hours: number[]) => {
        const cart = (await api.post("/store/carts", { region_id: regionId }, store)).data.cart
        const holds: string[] = []
        for (const h of hours) {
          const { result } = await addBookingToCartWorkflow(getContainer()).run({
            input: { cart_id: cart.id, variant_id: serviceId, resource_id: resourceId, ...slot(h) },
          })
          holds.push(result.booking.id)
        }
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
        await api.post(
          `/store/carts/${cart.id}`,
          { shipping_address: address, billing_address: address, email: "sok@example.com" },
          store
        )
        const {
          data: { shipping_options },
        } = await api.get(`/store/shipping-options?cart_id=${cart.id}`, store)
        await api.post(
          `/store/carts/${cart.id}/shipping-methods`,
          { option_id: shipping_options.find((o) => o.name === "Phnom Penh Delivery").id },
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
        return { orderId: data.order.id as string, holds }
      }
      // The subscriber runs after the event; wait until its workflow has
      // finished: the bookings are confirmed (step 2) AND linked to the order
      // (step 3, a moment later).
      const waitConfirmed = async (ids: string[]) => {
        for (let i = 0; i < 60; i++) {
          const { data: rows } = await query().graph({
            entity: "booking",
            fields: ["id", "status", "hold_expires_at", "order.id"],
            filters: { id: ids },
          })
          if (rows.length === ids.length && rows.every((b) => b.status === "confirmed" && b.order?.id)) {
            return await booking().listBookings({ id: ids })
          }
          await new Promise((r) => setTimeout(r, 250))
        }
        throw new Error("bookings were not confirmed and linked")
      }
      const linkedTo = async (orderId: string) => {
        const {
          data: [order],
        } = await query().graph({ entity: "order", fields: ["id", "bookings.id"], filters: { id: orderId } })
        return (order.bookings ?? []).map((b) => b?.id).sort()
      }

      it("confirms the booking, clears the hold and links it to the order", async () => {
        const { orderId, holds } = await checkout([3])

        const [confirmed] = await waitConfirmed(holds)
        expect(confirmed).toMatchObject({ status: "confirmed", hold_expires_at: null })
        expect(await linkedTo(orderId)).toEqual(holds)
        // The order item still carries the booking.
        const {
          data: [order],
        } = await query().graph({ entity: "order", fields: ["items.metadata"], filters: { id: orderId } })
        expect(order.items?.[0]?.metadata).toMatchObject({ booking_id: holds[0] })
      })

      it("confirms and links every booking of an order with several slots", async () => {
        const { orderId, holds } = await checkout([2, 4])

        await waitConfirmed(holds)
        expect(await linkedTo(orderId)).toEqual([...holds].sort())
      })

      it("is idempotent: running it again changes nothing and makes no second link", async () => {
        const { orderId, holds } = await checkout([5])
        await waitConfirmed(holds)

        const { result } = await confirmOrderBookingsWorkflow(getContainer()).run({ input: { order_id: orderId } })
        expect(result).toEqual(holds)
        await confirmOrderBookingsWorkflow(getContainer()).run({ input: { order_id: orderId } })

        expect(await linkedTo(orderId)).toEqual(holds)
        const { data: links } = await query().graph({
          entity: "booking",
          fields: ["id", "status", "order.id"],
          filters: { id: holds },
        })
        expect(links).toEqual([{ id: holds[0], status: "confirmed", order: expect.objectContaining({ id: orderId }) }])
      })

      it("does nothing for an order without bookings", async () => {
        const [order] = await getContainer().resolve(Modules.ORDER).createOrders([{ currency_code: "usd" }])
        const { result } = await confirmOrderBookingsWorkflow(getContainer()).run({ input: { order_id: order.id } })
        expect(result).toEqual([])
        expect(await linkedTo(order.id)).toEqual([])
      })
    })
  },
})
