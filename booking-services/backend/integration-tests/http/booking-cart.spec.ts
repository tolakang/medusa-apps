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

// TASKS P3-04 (BUILD_PLAN §6.3): add-booking-to-cart creates the hold and
// the line item together, with compensation. Data as on staging (demo
// catalog + Cambodia shop); a demo variant stands in for a service.
jest.setTimeout(180 * 1000)

// A slot a week ahead, 10:00-11:00 in Phnom Penh (03:00-04:00 UTC), so the
// test never books in the past whatever day it runs.
const day = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const STARTS = `${day}T03:00:00.000Z`
// A failed workflow run rejects with the serialized step error (a plain
// object with message and type, not an Error), so match on its fields.
const refused = (message: string) => ({ message: expect.stringContaining(message) })
const ENDS = `${day}T04:00:00.000Z`

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("add-booking-to-cart (TASKS P3-04)", () => {
      let store: { headers: Record<string, string> }
      let regionId: string
      let variantId: string

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
        } = await query.graph({
          entity: "product_variant",
          fields: ["id"],
          filters: { title: "L / White" },
        })
        variantId = variant.id
      })

      // A stylist open every day 00:00-23:59 who offers the given variants.
      const stylist = async (variantIds: string[]) => {
        const container = getContainer()
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
        if (variantIds.length) {
          await container.resolve(ContainerRegistrationKeys.LINK).create(
            variantIds.map((product_variant_id) => ({
              [BOOKING_MODULE]: { booking_resource_id: resource.id },
              [Modules.PRODUCT]: { product_variant_id },
            }))
          )
        }
        return resource
      }
      const newCart = async () =>
        (await api.post("/store/carts", { region_id: regionId }, store)).data.cart
      const cartItems = async (cartId: string) =>
        (await api.get(`/store/carts/${cartId}`, store)).data.cart.items
      const bookingsOf = (resource_id: string) =>
        getContainer().resolve<BookingModuleService>(BOOKING_MODULE).listBookings({ resource_id })

      it("creates the hold and its line item together", async () => {
        const resource = await stylist([variantId])
        const cart = await newCart()

        const { result } = await addBookingToCartWorkflow(getContainer()).run({
          input: {
            cart_id: cart.id,
            variant_id: variantId,
            resource_id: resource.id,
            starts_at: STARTS,
            ends_at: ENDS,
            notes: "First visit",
          },
        })

        expect(result.booking).toMatchObject({
          status: "pending",
          cart_id: cart.id,
          line_item_id: result.line_item_id,
          notes: "First visit",
        })
        expect(new Date(result.booking.starts_at).toISOString()).toEqual(STARTS)
        expect(result.booking.hold_expires_at).not.toBeNull()

        const items = await cartItems(cart.id)
        expect(items).toHaveLength(1)
        expect(items[0]).toMatchObject({
          id: result.line_item_id,
          variant_id: variantId,
          quantity: 1,
          metadata: {
            booking_id: result.booking.id,
            booking_resource_id: resource.id,
            booking_starts_at: STARTS,
            booking_ends_at: ENDS,
            // For display (P3-13).
            booking_resource_name: "Sophea",
            booking_timezone: "Asia/Phnom_Penh",
          },
        })
      })

      it("refuses a second cart for a slot that is already held, leaving that cart empty", async () => {
        const resource = await stylist([variantId])
        const [first, second] = [await newCart(), await newCart()]
        const run = (cart_id: string) =>
          addBookingToCartWorkflow(getContainer()).run({
            input: { cart_id, variant_id: variantId, resource_id: resource.id, starts_at: STARTS, ends_at: ENDS },
          })

        await run(first.id)
        await expect(run(second.id)).rejects.toMatchObject(refused("This time is no longer available."))

        expect(await cartItems(second.id)).toHaveLength(0)
        expect(await bookingsOf(resource.id)).toHaveLength(1)
      })

      it("refuses a service the resource doesn't offer, before anything is written", async () => {
        const resource = await stylist([])
        const cart = await newCart()

        await expect(
          addBookingToCartWorkflow(getContainer()).run({
            input: { cart_id: cart.id, variant_id: variantId, resource_id: resource.id, starts_at: STARTS, ends_at: ENDS },
          })
        ).rejects.toMatchObject(refused("This resource doesn't offer this service."))

        expect(await cartItems(cart.id)).toHaveLength(0)
        expect(await bookingsOf(resource.id)).toHaveLength(0)
      })

      it("deletes the hold again when the line item can't be added (compensation)", async () => {
        const container = getContainer()
        // A variant in no sales channel and without a price: the resource
        // offers it, so the hold is created, but addToCartWorkflow refuses it.
        const [orphan] = await container.resolve(Modules.PRODUCT).createProducts([
          {
            title: "Unlisted service",
            options: [{ title: "Length", values: ["30 min"] }],
            variants: [{ title: "30 min", options: { Length: "30 min" }, manage_inventory: false }],
          },
        ])
        const resource = await stylist([orphan.variants[0].id])
        const cart = await newCart()

        const { errors } = await addBookingToCartWorkflow(container).run({
          input: {
            cart_id: cart.id,
            variant_id: orphan.variants[0].id,
            resource_id: resource.id,
            starts_at: STARTS,
            ends_at: ENDS,
          },
          throwOnError: false,
        })

        // It failed in the nested add-to-cart, i.e. after the hold was made,
        // and the hold step was rolled back.
        expect(errors.map((e) => e.action)).toContain("add-to-cart-as-step")
        expect(errors.map((e) => e.action)).not.toContain("prepare-booking")

        expect(await bookingsOf(resource.id)).toHaveLength(0)
        expect(await cartItems(cart.id)).toHaveLength(0)
        // The slot is free again.
        expect(
          await container.resolve<BookingModuleService>(BOOKING_MODULE).isSlotAvailable({
            resource_id: resource.id,
            starts_at: new Date(STARTS),
            ends_at: new Date(ENDS),
          })
        ).toBe(true)
      })

      it("refuses an unknown cart or resource", async () => {
        const resource = await stylist([variantId])
        const cart = await newCart()
        const run = (cart_id: string, resource_id: string) =>
          addBookingToCartWorkflow(getContainer()).run({
            input: { cart_id, variant_id: variantId, resource_id, starts_at: STARTS, ends_at: ENDS },
          })

        await expect(run("cart_missing", resource.id)).rejects.toMatchObject(refused("was not found"))
        await expect(run(cart.id, "bres_missing")).rejects.toMatchObject(refused("was not found"))
        expect(await bookingsOf(resource.id)).toHaveLength(0)
      })
    })
  },
})
