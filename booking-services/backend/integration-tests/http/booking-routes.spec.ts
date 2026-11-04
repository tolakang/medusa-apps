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

// TASKS P3-10 (BUILD_PLAN §6.3): GET /store/booking/availability,
// GET /store/booking/slots, POST /store/booking/cancel, plus
// POST /store/booking/cart (F-047), through the real store API.
jest.setTimeout(240 * 1000)

// A date a week ahead, its weekday in Phnom Penh, and local 09:00 = 02:00 UTC.
const DATE = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const WEEKDAY = new Date(`${DATE}T00:00:00Z`).getUTCDay()
const utc = (hhmm: string) => `${DATE}T${hhmm}:00.000Z`

type ApiError = { response?: { status: number; data: { message?: string } } }

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("store booking routes (TASKS P3-10)", () => {
      let store: { headers: Record<string, string> }
      let regionId: string
      let serviceId: string
      let otherVariantId: string
      let stylistId: string

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
        const { data: variants } = await query.graph({
          entity: "product_variant",
          fields: ["id", "title"],
          filters: { title: ["L / White", "M / White"] },
        })
        serviceId = variants.find((v) => v.title === "L / White")!.id
        otherVariantId = variants.find((v) => v.title === "M / White")!.id

        // Sophea: open 09:00-12:00 local on that weekday, offers the service.
        const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
        const stylist = await booking.createBookingResources({
          name: "Sophea",
          type: "staff",
          timezone: "Asia/Phnom_Penh",
        })
        await booking.createBookingSchedules({
          resource_id: stylist.id,
          weekday: WEEKDAY,
          start_time: "09:00",
          end_time: "12:00",
        })
        await container.resolve(ContainerRegistrationKeys.LINK).create({
          [BOOKING_MODULE]: { booking_resource_id: stylist.id },
          [Modules.PRODUCT]: { product_variant_id: serviceId },
        })
        stylistId = stylist.id
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
      const slotsOf = async (qs: string) =>
        (await api.get(`/store/booking/slots?${qs}`, store)).data
      const customerToken = async (email: string) => {
        const container = getContainer()
        const customer = await container.resolve(Modules.CUSTOMER).createCustomers({ email })
        const identity = await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { customer_id: customer.id },
        })
        const token = jwt.sign(
          { actor_id: customer.id, actor_type: "customer", auth_identity_id: identity.id },
          "supersecret",
          { expiresIn: "1d" }
        )
        return { customerId: customer.id, headers: { ...store.headers, authorization: `Bearer ${token}` } }
      }

      describe("GET /store/booking/slots", () => {
        it("lists the free hours of the day for the service, with the resource", async () => {
          const data = await slotsOf(`variant_id=${serviceId}&date=${DATE}`)
          expect(data).toMatchObject({ date: DATE, duration_minutes: 60 })
          expect(data.slots.map((s) => [s.starts_at, s.resource_name, s.remaining])).toEqual([
            [utc("02:00"), "Sophea", 1],
            [utc("03:00"), "Sophea", 1],
            [utc("04:00"), "Sophea", 1],
          ])
          expect(data.slots[0]).toMatchObject({ resource_id: stylistId, timezone: "Asia/Phnom_Penh", ends_at: utc("03:00") })

          const ninety = await slotsOf(`variant_id=${serviceId}&date=${DATE}&duration_minutes=90`)
          expect(ninety.slots.map((s) => s.starts_at)).toEqual([utc("02:00"), utc("03:30")])
        })

        it("no longer lists a slot once it's held", async () => {
          const cart = (await api.post("/store/carts", { region_id: regionId }, store)).data.cart
          await api.post(
            "/store/booking/cart",
            { cart_id: cart.id, variant_id: serviceId, resource_id: stylistId, starts_at: utc("03:00"), ends_at: utc("04:00") },
            store
          )
          const data = await slotsOf(`variant_id=${serviceId}&date=${DATE}`)
          expect(data.slots.map((s) => s.starts_at)).toEqual([utc("02:00"), utc("04:00")])
        })

        it("is empty for a service nobody offers; refuses bad input", async () => {
          expect((await slotsOf(`variant_id=${otherVariantId}&date=${DATE}`)).slots).toEqual([])
          expect(await failure(api.get(`/store/booking/slots?variant_id=${serviceId}&date=tomorrow`, store))).toMatchObject({
            status: 400,
            message: expect.stringContaining("date"),
          })
          expect(await failure(api.get(`/store/booking/slots?variant_id=variant_missing&date=${DATE}`, store))).toMatchObject({
            status: 404,
          })
          expect(
            await failure(api.get(`/store/booking/slots?variant_id=${otherVariantId}&date=${DATE}&resource_id=${stylistId}`, store))
          ).toEqual({ status: 400, message: "This resource doesn't offer this service." })
        })
      })

      describe("GET /store/booking/availability", () => {
        it("says whether a time can be booked, with the reason", async () => {
          const ask = (s: string, e: string) =>
            api.get(`/store/booking/availability?resource_id=${stylistId}&starts_at=${s}&ends_at=${e}`, store)

          expect((await ask(utc("02:00"), utc("03:00"))).data.availability).toEqual({ available: true, capacity: 1, remaining: 1 })
          await booking().createBookings({
            resource_id: stylistId,
            starts_at: new Date(utc("02:00")),
            ends_at: new Date(utc("03:00")),
            status: "confirmed",
          })
          expect((await ask(utc("02:00"), utc("03:00"))).data.availability).toMatchObject({
            available: false,
            reason: "full",
            message: "This time is no longer available.",
          })
          expect((await ask(utc("06:00"), utc("07:00"))).data.availability).toMatchObject({ reason: "outside_hours" })
          expect(
            await failure(api.get(`/store/booking/availability?resource_id=${stylistId}&starts_at=soon&ends_at=later`, store))
          ).toMatchObject({ status: 400 })
        })
      })

      describe("POST /store/booking/cart", () => {
        it("holds the time and adds it to the cart; validates the body", async () => {
          const cart = (await api.post("/store/carts", { region_id: regionId }, store)).data.cart
          const { data } = await api.post(
            "/store/booking/cart",
            { cart_id: cart.id, variant_id: serviceId, resource_id: stylistId, starts_at: utc("02:00"), ends_at: utc("03:00") },
            store
          )
          expect(data.booking).toMatchObject({ status: "pending" })
          expect(data.line_item_id).toEqual(expect.any(String))
          const items = (await api.get(`/store/carts/${cart.id}`, store)).data.cart.items
          expect(items.map((i) => i.id)).toEqual([data.line_item_id])

          expect(
            await failure(api.post("/store/booking/cart", { cart_id: cart.id, variant_id: serviceId }, store))
          ).toMatchObject({ status: 400 })
          expect(
            await failure(
              api.post(
                "/store/booking/cart",
                { cart_id: cart.id, variant_id: serviceId, resource_id: stylistId, starts_at: utc("02:00"), ends_at: utc("03:00") },
                store
              )
            )
          ).toEqual({ status: 400, message: "This time is no longer available." })
        })
      })

      describe("POST /store/booking/cancel", () => {
        it("lets a signed-in customer cancel their own booking only", async () => {
          const sok = await customerToken("sok@example.com")
          const dara = await customerToken("dara@example.com")
          const mine = await booking().createBookings({
            resource_id: stylistId,
            starts_at: new Date(utc("02:00")),
            ends_at: new Date(utc("03:00")),
            status: "confirmed",
            customer_id: sok.customerId,
          })

          expect(
            await failure(api.post("/store/booking/cancel", { booking_id: mine.id }, store))
          ).toMatchObject({ status: 401 })
          expect(
            await failure(api.post("/store/booking/cancel", { booking_id: mine.id }, { headers: dara.headers }))
          ).toMatchObject({ status: 404 })
          expect(
            await failure(api.post("/store/booking/cancel", {}, { headers: sok.headers }))
          ).toMatchObject({ status: 400 })

          const { data } = await api.post("/store/booking/cancel", { booking_id: mine.id }, { headers: sok.headers })
          // A walk-in style booking without an order: nothing to refund.
          expect(data).toEqual({ booking: { id: mine.id, status: "cancelled" }, refund: "no_order", refunded_amount: 0 })
        })
      })
    })
  },
})
