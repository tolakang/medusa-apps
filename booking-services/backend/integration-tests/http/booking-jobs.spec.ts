import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import releaseExpiredHoldsJob from "../../src/jobs/release-expired-holds"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"
import { addBookingToCartWorkflow } from "../../src/workflows/add-booking-to-cart"
import { sendBookingRemindersWorkflow } from "../../src/workflows/send-booking-reminders"

// TASKS P3-09 (BUILD_PLAN §6.3): the release job and the 24-hour reminders,
// and the P3-15 acceptance criterion: an abandoned checkout frees the slot
// automatically.
jest.setTimeout(240 * 1000)

const day = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const STARTS = `${day}T03:00:00.000Z`
const ENDS = `${day}T04:00:00.000Z`
const HOUR = 3600 * 1000

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("booking jobs (TASKS P3-09, P3-15)", () => {
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
      const holdInNewCart = async () => {
        const cart = (await api.post("/store/carts", { region_id: regionId }, store)).data.cart
        return (
          await addBookingToCartWorkflow(getContainer()).run({
            input: { cart_id: cart.id, variant_id: serviceId, resource_id: resourceId, starts_at: STARTS, ends_at: ENDS },
          })
        ).result.booking
      }
      const remindersTo = async (bookingId: string) =>
        (
          await query().graph({
            entity: "notification",
            fields: ["to", "channel", "template", "data", "idempotency_key"],
            filters: { resource_id: bookingId },
          })
        ).data

      it("P3-15: an abandoned checkout frees the slot; the job marks the hold expired", async () => {
        const abandoned = await holdInNewCart()
        // The customer walked away: the hold ran out a minute ago.
        await booking().updateBookings({ id: abandoned.id, hold_expires_at: new Date(Date.now() - 60_000) })

        await releaseExpiredHoldsJob(getContainer())
        expect((await booking().listBookings({ id: abandoned.id }))[0].status).toEqual("expired")

        // Another customer can now hold and add the same time.
        const next = await holdInNewCart()
        expect(next.status).toEqual("pending")
        // A second run of the job changes nothing.
        await releaseExpiredHoldsJob(getContainer())
        expect((await booking().listBookings({ id: next.id }))[0].status).toEqual("pending")
      })

      it("emails a reminder once for a confirmed booking within the next 24 hours", async () => {
        const customer = await getContainer()
          .resolve(Modules.CUSTOMER)
          .createCustomers({ email: "sok@example.com", first_name: "Sok", last_name: "Dara" })
        const at = (h: number) => new Date(Date.now() + h * HOUR)
        const [soon, later, noEmail] = await booking().createBookings([
          { resource_id: resourceId, starts_at: at(20), ends_at: at(21), status: "confirmed", customer_id: customer.id },
          { resource_id: resourceId, starts_at: at(30), ends_at: at(31), status: "confirmed", customer_id: customer.id },
          { resource_id: resourceId, starts_at: at(22), ends_at: at(23), status: "confirmed" },
        ])

        const { result } = await sendBookingRemindersWorkflow(getContainer()).run({ input: {} })
        expect(result).toEqual({ due: 2, emailed: 1, no_email: 1 })

        expect(await remindersTo(soon.id)).toEqual([
          expect.objectContaining({
            to: "sok@example.com",
            channel: "email",
            template: "booking-reminder",
            idempotency_key: `booking_reminder_${soon.id}`,
            data: expect.objectContaining({
              booking: expect.objectContaining({ id: soon.id, resource_name: "Sophea", customer_name: "Sok Dara" }),
            }),
          }),
        ])
        expect(await remindersTo(later.id)).toEqual([])
        const rows = await booking().listBookings({ id: [soon.id, later.id, noEmail.id] })
        const sentAt = Object.fromEntries(rows.map((b) => [b.id, b.reminder_sent_at]))
        expect(sentAt[soon.id]).not.toBeNull()
        expect(sentAt[noEmail.id]).not.toBeNull()
        expect(sentAt[later.id]).toBeNull()

        // Running again sends nothing new.
        const again = await sendBookingRemindersWorkflow(getContainer()).run({ input: {} })
        expect(again.result).toEqual({ due: 0, emailed: 0, no_email: 0 })
        expect(await remindersTo(soon.id)).toHaveLength(1)
      })

      it("skips holds, cancelled bookings and bookings that already started", async () => {
        const at = (h: number) => new Date(Date.now() + h * HOUR)
        await booking().createBookings([
          { resource_id: resourceId, starts_at: at(5), ends_at: at(6), status: "pending", hold_expires_at: at(1) },
          { resource_id: resourceId, starts_at: at(6), ends_at: at(7), status: "cancelled" },
          { resource_id: resourceId, starts_at: at(-1), ends_at: at(1), status: "confirmed" },
        ])

        const { result } = await sendBookingRemindersWorkflow(getContainer()).run({ input: {} })
        expect(result).toEqual({ due: 0, emailed: 0, no_email: 0 })
      })
    })
  },
})
