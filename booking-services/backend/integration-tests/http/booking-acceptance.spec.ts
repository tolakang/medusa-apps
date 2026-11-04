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

// Phase 3 acceptance (BUILD_PLAN §6.3), through the store API the
// storefront uses, on the Cambodia seed + booking demo (Haircut, Sophea):
// - P3-14: two customers can't hold the same slot, even at the same moment.
// - P3-17: a retried cart completion doesn't double-book or fail on its own
//   hold.
// (P3-15 is in booking-jobs.spec.ts, P3-16 in booking-cancel.spec.ts.)
jest.setTimeout(300 * 1000)

const monday = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
})()
// Monday 10:00-11:00 in Phnom Penh.
const STARTS = `${monday}T03:00:00.000Z`
const ENDS = `${monday}T04:00:00.000Z`

type ApiResponse = { status: number; data: Record<string, any> }

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("booking acceptance (TASKS P3-14, P3-17)", () => {
      let store: { headers: Record<string, string> }
      let regionId: string
      let serviceId: string
      let stylistId: string

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
        const {
          data: [variant],
        } = await query.graph({ entity: "product_variant", fields: ["id"], filters: { sku: "HAIRCUT-60" } })
        serviceId = variant.id
        const {
          data: [stylist],
        } = await query.graph({ entity: "booking_resource", fields: ["id"], filters: { name: "Sophea" } })
        stylistId = stylist.id
      })

      const booking = () => getContainer().resolve<BookingModuleService>(BOOKING_MODULE)
      const newCart = async () => (await api.post("/store/carts", { region_id: regionId }, store)).data.cart.id as string
      // A store call that may fail: always resolves with status and data.
      const call = (p: Promise<ApiResponse>): Promise<ApiResponse> =>
        p.catch((e) => ({ status: e.response?.status ?? 0, data: e.response?.data ?? {} }))
      const addSlot = (cartId: string) =>
        call(
          api.post(
            "/store/booking/cart",
            { cart_id: cartId, variant_id: serviceId, resource_id: stylistId, starts_at: STARTS, ends_at: ENDS },
            store
          )
        )
      const pay = async (cartId: string) => {
        await api.post(`/store/carts/${cartId}`, { email: "sok@example.com" }, store)
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cartId }, store)
        await api.post(
          `/store/payment-collections/${payment_collection.id}/payment-sessions`,
          { provider_id: "pp_system_default" },
          store
        )
      }
      const complete = (cartId: string) => call(api.post(`/store/carts/${cartId}/complete`, {}, store))
      const slotBookings = () =>
        booking().listBookings({ resource_id: stylistId, starts_at: new Date(STARTS) })

      it("P3-14: of many customers adding the same slot at once, exactly one gets it", async () => {
        const carts = await Promise.all(Array.from({ length: 6 }, () => newCart()))

        const results = await Promise.all(carts.map((c) => addSlot(c)))

        expect(results.filter((r) => r.status === 200)).toHaveLength(1)
        const refused = results.filter((r) => r.status !== 200)
        expect(refused).toHaveLength(5)
        for (const r of refused) {
          expect(r).toEqual({ status: 400, data: expect.objectContaining({ message: "This time is no longer available." }) })
        }
        // One hold, in the winner's cart; every other cart is empty.
        const holds = await slotBookings()
        expect(holds).toHaveLength(1)
        const items = await Promise.all(
          carts.map(async (c) => (await api.get(`/store/carts/${c}`, store)).data.cart.items.length)
        )
        expect([...items].sort()).toEqual([0, 0, 0, 0, 0, 1])
        expect(holds[0].cart_id).toEqual(carts[items.indexOf(1)])
      })

      it("P3-14: once one customer holds the slot, the next one is refused and it isn't offered", async () => {
        const [first, second] = [await newCart(), await newCart()]
        expect((await addSlot(first)).status).toEqual(200)
        expect(await addSlot(second)).toMatchObject({ status: 400, data: { message: "This time is no longer available." } })

        const {
          data: { slots },
        } = await api.get(`/store/booking/slots?variant_id=${serviceId}&date=${monday}`, store)
        expect(slots.map((s) => s.starts_at)).not.toContain(STARTS)
      })

      it("P3-17: a retried completion returns the same order and books the slot once", async () => {
        const cartId = await newCart()
        expect((await addSlot(cartId)).status).toEqual(200)
        await pay(cartId)

        const first = await complete(cartId)
        expect(first).toMatchObject({ status: 200, data: { type: "order" } })
        // The customer's app retries (lost response, double tap).
        const second = await complete(cartId)
        expect(second).toMatchObject({ status: 200, data: { type: "order" } })
        expect(second.data.order.id).toEqual(first.data.order.id)

        // Wait for the order.placed subscriber to confirm AND link (its
        // last step), then: one booking, confirmed, linked once to that order.
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        for (let i = 0; i < 60; i++) {
          const { data } = await query.graph({
            entity: "booking",
            fields: ["status", "order.id"],
            filters: { resource_id: stylistId, starts_at: new Date(STARTS) },
          })
          if (data[0]?.status === "confirmed" && data[0].order?.id) break
          await new Promise((r) => setTimeout(r, 250))
        }
        const rows = await slotBookings()
        expect(rows.map((b) => b.status)).toEqual(["confirmed"])
        const { data: orders } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({ entity: "order", fields: ["id", "bookings.id"] })
        expect(orders).toHaveLength(1)
        expect(orders[0].bookings!.map((b) => b!.id)).toEqual([rows[0].id])

        // A third retry after the booking is confirmed still succeeds.
        expect((await complete(cartId)).data.order?.id).toEqual(first.data.order.id)
      })

      it("P3-17: two completions of the same cart at the same moment make one order", async () => {
        const cartId = await newCart()
        expect((await addSlot(cartId)).status).toEqual(200)
        await pay(cartId)

        const [a, b] = await Promise.all([complete(cartId), complete(cartId)])
        const orderIds = [a, b].filter((r) => r.data?.type === "order").map((r) => r.data.order.id)
        // At least one succeeds; any that succeed name the same order.
        expect(orderIds.length).toBeGreaterThanOrEqual(1)
        expect(new Set(orderIds).size).toEqual(1)

        const { data: orders } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({ entity: "order", fields: ["id"] })
        expect(orders).toHaveLength(1)
        expect(await slotBookings()).toHaveLength(1)
      })

      it("P3-17: a retry after the hold ran out still completes when nobody took the time", async () => {
        const cartId = await newCart()
        const { data } = await addSlot(cartId)
        await pay(cartId)
        await booking().updateBookings({ id: data.booking.id, hold_expires_at: new Date(Date.now() - 60_000) })

        expect((await complete(cartId)).data.type).toEqual("order")
      })
    })
  },
})
