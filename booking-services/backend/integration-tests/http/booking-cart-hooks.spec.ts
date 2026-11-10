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

// TASKS P3-05 (BUILD_PLAN §6.3): the cart hooks through the real store API.
// addToCart.validate: a service needs a held time, and the item must match
// its hold. updateLineItemInCart.validate: one place, time can't change.
// completeCart.validate (read-only): the slot is still there; the cart's own
// hold counts, so a retried completion stays valid (P3-17 is the full
// retry test). A demo variant (L / White) stands in for a service.
jest.setTimeout(240 * 1000)

const day = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const STARTS = `${day}T03:00:00.000Z`
const ENDS = `${day}T04:00:00.000Z`

type ApiError = { response?: { status: number; data: { message?: string; type?: string } } }

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("booking cart hooks (TASKS P3-05)", () => {
      let store: { headers: Record<string, string> }
      let regionId: string
      let serviceId: string
      let plainId: string

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
        plainId = variants.find((v) => v.title === "M / White")!.id
      })

      const booking = () => getContainer().resolve<BookingModuleService>(BOOKING_MODULE)

      // A stylist, open every day, who offers the "service" variant.
      const stylist = async () => {
        const resource = await booking().createBookingResources({
          name: "Sophea",
          type: "staff",
          timezone: "Asia/Phnom_Penh",
        })
        await booking().createBookingSchedules(
          [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            resource_id: resource.id,
            weekday,
            start_time: "00:00",
            end_time: "23:59",
          }))
        )
        await getContainer()
          .resolve(ContainerRegistrationKeys.LINK)
          .create({
            [BOOKING_MODULE]: { booking_resource_id: resource.id },
            [Modules.PRODUCT]: { product_variant_id: serviceId },
          })
        return resource
      }
      const newCart = async () =>
        (await api.post("/store/carts", { region_id: regionId }, store)).data.cart
      const bookInto = async (cartId: string, resourceId: string) =>
        (
          await addBookingToCartWorkflow(getContainer()).run({
            input: {
              cart_id: cartId,
              variant_id: serviceId,
              resource_id: resourceId,
              starts_at: STARTS,
              ends_at: ENDS,
            },
          })
        ).result
      const items = async (cartId: string) =>
        (await api.get(`/store/carts/${cartId}`, store)).data.cart.items
      // A store call that must fail: returns its status and message.
      const refusedBy = async (call: Promise<unknown>) => {
        try {
          await call
        } catch (e) {
          const err = e as ApiError
          return { status: err.response?.status, message: err.response?.data.message ?? "" }
        }
        throw new Error("expected the store API to refuse")
      }

      // Address, Phnom Penh Delivery and a system payment session, as the
      // checkout acceptance test (P1-07) does.
      const readyForCheckout = async (cartId: string) => {
        const address = {
          first_name: "Test",
          last_name: "Customer",
          address_1: "#111, St 310",
          province: "Phnom Penh",
          city: "Khan Chamkar Mon",
          postal_code: "120100",
          country_code: "kh",
          phone: "012 345 678",
        }
        await api.post(
          `/store/carts/${cartId}`,
          { shipping_address: address, billing_address: address, email: "sok@example.com" },
          store
        )
        const {
          data: { shipping_options },
        } = await api.get(`/store/shipping-options?cart_id=${cartId}`, store)
        const delivery = shipping_options.find((o) => o.name === "Phnom Penh Delivery")
        await api.post(`/store/carts/${cartId}/shipping-methods`, { option_id: delivery.id }, store)
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cartId }, store)
        await api.post(
          `/store/payment-collections/${payment_collection.id}/payment-sessions`,
          { provider_id: "pp_system_default" },
          store
        )
      }
      // The complete route answers 200 with { type: "cart", error } when the
      // workflow fails, or an error status; both count as refused here.
      const complete = async (cartId: string) => {
        try {
          const { data } = await api.post(`/store/carts/${cartId}/complete`, {}, store)
          return data.type === "order"
            ? { order: data.order.id as string }
            : { refused: (data.error?.message ?? "") as string }
        } catch (e) {
          return { refused: (e as ApiError).response?.data.message ?? "" }
        }
      }

      describe("addToCartWorkflow.validate", () => {
        it("refuses a service added without a booked time; other products still work", async () => {
          await stylist()
          const cart = await newCart()

          const refused = await refusedBy(
            api.post(`/store/carts/${cart.id}/line-items`, { variant_id: serviceId, quantity: 1 }, store)
          )
          expect(refused.status).toEqual(400)
          expect(refused.message).toEqual("Please choose a time to book this service.")

          await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: plainId, quantity: 2 }, store)
          expect((await items(cart.id)).map((i) => [i.variant_id, i.quantity])).toEqual([[plainId, 2]])
        })

        it("accepts the booking added by add-booking-to-cart", async () => {
          const resource = await stylist()
          const cart = await newCart()
          const { booking: hold } = await bookInto(cart.id, resource.id)

          expect((await items(cart.id)).map((i) => i.metadata?.booking_id)).toEqual([hold.id])
        })

        it("refuses another cart's hold, a changed time, a second copy, or more than one place", async () => {
          const resource = await stylist()
          const [mine, theirs] = [await newCart(), await newCart()]
          const { booking: hold } = await bookInto(theirs.id, resource.id)
          const metadata = {
            booking_id: hold.id,
            booking_resource_id: resource.id,
            booking_starts_at: STARTS,
            booking_ends_at: ENDS,
          }
          const add = (cartId: string, body: Record<string, unknown>) =>
            refusedBy(
              api.post(`/store/carts/${cartId}/line-items`, { variant_id: serviceId, quantity: 1, ...body }, store)
            )

          expect((await add(mine.id, { metadata })).message).toMatch(/isn't held for this cart/)
          // A hold made for `mine` (not yet in the cart) but sent with another time.
          const later = await booking().createHold({
            resource_id: resource.id,
            starts_at: new Date(`${day}T05:00:00.000Z`),
            ends_at: new Date(`${day}T06:00:00.000Z`),
            cart_id: mine.id,
          })
          expect(
            (
              await add(mine.id, {
                metadata: {
                  booking_id: later.id,
                  booking_resource_id: resource.id,
                  booking_starts_at: `${day}T05:00:00.000Z`,
                  booking_ends_at: `${day}T07:00:00.000Z`,
                },
              })
            ).message
          ).toMatch(/don't match/)
          expect((await add(theirs.id, { metadata })).message).toEqual("This booking is already in the cart.")
          expect(
            (
              await add(mine.id, {
                quantity: 2,
                metadata: {
                  booking_id: later.id,
                  booking_resource_id: resource.id,
                  booking_starts_at: `${day}T05:00:00.000Z`,
                  booking_ends_at: `${day}T06:00:00.000Z`,
                },
              })
            ).message
          ).toMatch(/one place/)

          expect(await items(mine.id)).toHaveLength(0)
          expect(await items(theirs.id)).toHaveLength(1)
        })
      })

      describe("updateLineItemInCartWorkflow.validate", () => {
        it("keeps a booking at one place; other items can change quantity", async () => {
          const resource = await stylist()
          const cart = await newCart()
          const { line_item_id } = await bookInto(cart.id, resource.id)
          await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: plainId, quantity: 1 }, store)
          const plainItem = (await items(cart.id)).find((i) => i.variant_id === plainId)

          const refused = await refusedBy(
            api.post(`/store/carts/${cart.id}/line-items/${line_item_id}`, { quantity: 2 }, store)
          )
          expect(refused).toEqual({
            status: 400,
            message: "A booking is for one place. Book another time to add more.",
          })
          await api.post(`/store/carts/${cart.id}/line-items/${plainItem.id}`, { quantity: 3 }, store)

          const after = await items(cart.id)
          expect(after.find((i) => i.id === line_item_id).quantity).toEqual(1)
          expect(after.find((i) => i.id === plainItem.id).quantity).toEqual(3)
        })
      })

      describe("completeCartWorkflow.validate", () => {
        it("places the order while the hold is valid", async () => {
          const resource = await stylist()
          const cart = await newCart()
          await bookInto(cart.id, resource.id)
          await readyForCheckout(cart.id)

          expect(await complete(cart.id)).toEqual({ order: expect.stringMatching(/^order_/) })
        })

        // The release job (every minute, P3-09) also runs in the test app and
        // releases holds that ran out, so these tests make the hold run out
        // only after checkout is ready, right before completing: the job's
        // window shrinks to one request (TASKS F-065).
        it("still places the order when the hold ran out but nobody took the time", async () => {
          const resource = await stylist()
          const cart = await newCart()
          const { booking: hold } = await bookInto(cart.id, resource.id)
          await readyForCheckout(cart.id)
          await booking().updateBookings({ id: hold.id, hold_expires_at: new Date(Date.now() - 1_000) })

          expect(await complete(cart.id)).toEqual({ order: expect.stringMatching(/^order_/) })
        })

        it("refuses when the hold ran out and someone else booked the time; no order is made", async () => {
          const resource = await stylist()
          const [slow, fast] = [await newCart(), await newCart()]
          const { booking: hold } = await bookInto(slow.id, resource.id)
          await readyForCheckout(slow.id)
          await booking().updateBookings({ id: hold.id, hold_expires_at: new Date(Date.now() - 1_000) })
          await bookInto(fast.id, resource.id)

          // Refused either way: "taken" when the hold is still marked held,
          // "released" when the release job got to it first.
          const result = await complete(slow.id)
          expect([
            "Your hold on this time ran out and the time was taken. Please choose another time.",
            "This booking was released. Please choose the time again.",
          ]).toContain(result.refused)
          const { data: orders } = await getContainer()
            .resolve(ContainerRegistrationKeys.QUERY)
            .graph({ entity: "order", fields: ["id"] })
          expect(orders).toHaveLength(0)
        })

        it("refuses a booking that was released", async () => {
          const resource = await stylist()
          const cart = await newCart()
          const { booking: hold } = await bookInto(cart.id, resource.id)
          await booking().updateBookings({ id: hold.id, status: "cancelled" })
          await readyForCheckout(cart.id)

          expect(await complete(cart.id)).toEqual({
            refused: "This booking was released. Please choose the time again.",
          })
        })
      })
    })
  },
})
