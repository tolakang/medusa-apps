import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"

// TASKS P3-11 (BUILD_PLAN §6.3): admin setup of resources (hours, services),
// the calendar data, walk-in booking and cancel, through the admin API.
jest.setTimeout(240 * 1000)

const DATE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const utc = (hhmm: string) => `${DATE}T${hhmm}:00.000Z`
const allWeek = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_time: "00:00", end_time: "23:59" }))

type ApiError = { response?: { status: number; data: { message?: string } } }

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("admin booking routes (TASKS P3-11)", () => {
      let admin: { headers: Record<string, string> }
      let variantA: string
      let variantB: string

      beforeEach(async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seedInitialData({ container })
        await seed({ container })
        const { data: variants } = await query.graph({
          entity: "product_variant",
          fields: ["id", "title"],
          filters: { title: ["L / White", "M / White"] },
        })
        variantA = variants.find((v) => v.title === "L / White")!.id
        variantB = variants.find((v) => v.title === "M / White")!.id

        const user = await container.resolve(Modules.USER).createUsers({ email: "admin@example.com" })
        const identity = await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: "admin@example.com" }],
          app_metadata: { user_id: user.id },
        })
        const token = jwt.sign({ actor_id: user.id, actor_type: "user", auth_identity_id: identity.id }, "supersecret", {
          expiresIn: "1d",
        })
        admin = { headers: { authorization: `Bearer ${token}` } }
      })

      const booking = () => getContainer().resolve<BookingModuleService>(BOOKING_MODULE)
      const failure = async (call: Promise<unknown>) => {
        try {
          await call
        } catch (e) {
          const err = e as ApiError
          return { status: err.response?.status, message: err.response?.data.message ?? "" }
        }
        throw new Error("expected the request to fail")
      }
      const createResource = async (body: Record<string, unknown>) =>
        (await api.post("/admin/booking/resources", body, admin)).data.resource

      it("creates a resource with hours and services, and lists it", async () => {
        const resource = await createResource({
          name: "Sophea",
          type: "staff",
          timezone: "Asia/Phnom_Penh",
          schedules: [{ weekday: 1, start_time: "09:00", end_time: "12:00" }],
          variant_ids: [variantA],
        })
        expect(resource).toMatchObject({ name: "Sophea", type: "staff", capacity: 1, is_active: true, timezone: "Asia/Phnom_Penh" })
        expect(resource.schedules).toEqual([expect.objectContaining({ weekday: 1, start_time: "09:00", end_time: "12:00" })])
        expect(resource.product_variants.map((v) => v.id)).toEqual([variantA])

        // No zone given: BOOKING_DEFAULT_TIMEZONE, else UTC.
        const room = await createResource({ name: "Room 1", type: "room", capacity: 4 })
        expect(room).toMatchObject({ timezone: process.env.BOOKING_DEFAULT_TIMEZONE || "UTC", capacity: 4 })

        const { data } = await api.get("/admin/booking/resources", admin)
        expect(data.resources.map((r) => r.name)).toEqual(["Room 1", "Sophea"])
      })

      it("refuses an unknown zone, an unknown service, bad hours, and callers who aren't admins", async () => {
        expect(await failure(api.post("/admin/booking/resources", { name: "X", type: "staff", timezone: "Mars/Base" }, admin)))
          .toEqual({ status: 400, message: 'Unknown time zone "Mars/Base".' })
        expect(
          await failure(api.post("/admin/booking/resources", { name: "X", type: "staff", variant_ids: ["variant_missing"] }, admin))
        ).toMatchObject({ status: 404 })
        expect(
          await failure(
            api.post(
              "/admin/booking/resources",
              { name: "X", type: "staff", schedules: [{ weekday: 1, start_time: "17:00", end_time: "09:00" }] },
              admin
            )
          )
        ).toMatchObject({ status: 400 })
        expect(await failure(api.get("/admin/booking/resources"))).toMatchObject({ status: 401 })
        expect(await booking().listBookingResources({})).toHaveLength(0)
      })

      it("replaces the hours and services on update", async () => {
        const resource = await createResource({
          name: "Sophea",
          type: "staff",
          timezone: "Asia/Phnom_Penh",
          schedules: [{ weekday: 1, start_time: "09:00", end_time: "12:00" }],
          variant_ids: [variantA],
        })
        const { data } = await api.post(
          `/admin/booking/resources/${resource.id}`,
          {
            name: "Sophea K.",
            capacity: 2,
            schedules: [
              { weekday: 2, start_time: "10:00", end_time: "14:00" },
              { weekday: 3, start_time: "10:00", end_time: "14:00" },
            ],
            variant_ids: [variantB],
          },
          admin
        )
        expect(data.resource).toMatchObject({ name: "Sophea K.", capacity: 2 })
        expect(data.resource.schedules.map((h) => h.weekday).sort()).toEqual([2, 3])
        expect(data.resource.product_variants.map((v) => v.id)).toEqual([variantB])

        // Only the name changes: hours and services stay.
        const again = (await api.post(`/admin/booking/resources/${resource.id}`, { name: "Sophea" }, admin)).data.resource
        expect(again.schedules).toHaveLength(2)
        expect(again.product_variants.map((v) => v.id)).toEqual([variantB])
        expect(await failure(api.post("/admin/booking/resources/bres_missing", { name: "Y" }, admin))).toMatchObject({ status: 404 })
      })

      it("books a walk-in within hours and capacity, and shows it on the calendar", async () => {
        const resource = await createResource({ name: "Sophea", type: "staff", timezone: "UTC", schedules: allWeek })
        const walkIn = (s: string, e: string, extra = {}) =>
          api.post("/admin/booking/bookings", { resource_id: resource.id, starts_at: s, ends_at: e, ...extra }, admin)

        const { data } = await walkIn(utc("09:00"), utc("10:00"), { notes: "Walked in" })
        expect(data.booking).toMatchObject({ status: "confirmed", hold_expires_at: null, cart_id: null, notes: "Walked in" })
        expect(await failure(walkIn(utc("09:30"), utc("10:30")))).toEqual({
          status: 400,
          message: "This time is no longer available.",
        })

        // A walk-in may start now (a minute ago) as long as it ends later.
        const now = Date.now()
        const started = await walkIn(new Date(now - 60_000).toISOString(), new Date(now + 60_000).toISOString())
        expect(started.data.booking.status).toEqual("confirmed")
        expect(
          await failure(walkIn(new Date(now - 7200_000).toISOString(), new Date(now - 3600_000).toISOString()))
        ).toMatchObject({ status: 400, message: "This time has already passed." })

        // Calendar: the day's bookings, with an expired hold left out and a
        // cancelled booking shown.
        await booking().createBookings([
          { resource_id: resource.id, starts_at: new Date(utc("11:00")), ends_at: new Date(utc("12:00")), status: "pending", hold_expires_at: new Date(now - 60_000) },
          { resource_id: resource.id, starts_at: new Date(utc("13:00")), ends_at: new Date(utc("14:00")), status: "cancelled" },
        ])
        const { data: cal } = await api.get(
          `/admin/booking/bookings?resource_id=${resource.id}&from=${utc("00:00")}&to=${DATE}T23:59:59.000Z`,
          admin
        )
        expect(cal.bookings.map((b) => [b.starts_at, b.status])).toEqual([
          [utc("09:00"), "confirmed"],
          [utc("13:00"), "cancelled"],
        ])
        expect(cal.bookings[0]).toMatchObject({ notes: "Walked in", customer: null, resource: { name: "Sophea", timezone: "UTC" } })
        expect(await failure(api.get(`/admin/booking/bookings?from=yesterday&to=today`, admin))).toMatchObject({ status: 400 })
      })

      it("cancels a booking from the calendar", async () => {
        const resource = await createResource({ name: "Sophea", type: "staff", timezone: "UTC", schedules: allWeek })
        const { data } = await api.post(
          "/admin/booking/bookings",
          { resource_id: resource.id, starts_at: utc("09:00"), ends_at: utc("10:00") },
          admin
        )
        const { data: cancelled } = await api.post(`/admin/booking/bookings/${data.booking.id}/cancel`, {}, admin)
        expect(cancelled).toEqual({ booking: { id: data.booking.id, status: "cancelled" }, refund: "no_order", refunded_amount: 0 })
      })
    })
  },
})
