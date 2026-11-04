import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import type { LinkDefinition } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"

// TASKS P3-02: booking resource ↔ product variant (many-to-many) and
// booking → order (many → one) (BUILD_PLAN §6.3), created with the Link
// service and read back with Query in both directions.
jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("Booking links (TASKS P3-02)", () => {
      it("links resources to the services they offer, many-to-many", async () => {
        const container = getContainer()
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)

        const [sophea, dara] = await booking.createBookingResources([
          { name: "Sophea", type: "staff", timezone: "Asia/Phnom_Penh" },
          { name: "Dara", type: "staff", timezone: "Asia/Phnom_Penh" },
        ])
        const [haircut] = await container.resolve(Modules.PRODUCT).createProducts([
          {
            title: "Haircut",
            options: [{ title: "Length", values: ["30 min", "60 min"] }],
            variants: [
              { title: "30 min", options: { Length: "30 min" } },
              { title: "60 min", options: { Length: "60 min" } },
            ],
          },
        ])
        const short = haircut.variants.find((v) => v.title === "30 min")!
        const long = haircut.variants.find((v) => v.title === "60 min")!

        // Sophea does both lengths, Dara only the short one.
        const pairs: [string, string][] = [
          [sophea.id, short.id],
          [sophea.id, long.id],
          [dara.id, short.id],
        ]
        await link.create(
          pairs.map(([booking_resource_id, product_variant_id]): LinkDefinition => ({
            [BOOKING_MODULE]: { booking_resource_id },
            [Modules.PRODUCT]: { product_variant_id },
          }))
        )

        // Resource side: the services it offers.
        const { data: resources } = await query.graph({
          entity: "booking_resource",
          fields: ["id", "product_variants.id"],
          filters: { id: [sophea.id, dara.id] },
        })
        const offered = Object.fromEntries(
          resources.map((r) => [r.id, (r.product_variants ?? []).map((v) => v?.id).sort()])
        )
        expect(offered[sophea.id]).toEqual([short.id, long.id].sort())
        expect(offered[dara.id]).toEqual([short.id])

        // Variant side: who can do it.
        const { data: variants } = await query.graph({
          entity: "product_variant",
          fields: ["id", "booking_resources.id"],
          filters: { id: [short.id, long.id] },
        })
        const doers = Object.fromEntries(
          variants.map((v) => [v.id, (v.booking_resources ?? []).map((r) => r?.id).sort()])
        )
        expect(doers[short.id]).toEqual([sophea.id, dara.id].sort())
        expect(doers[long.id]).toEqual([sophea.id])

        // Removing one pair leaves the others.
        await link.dismiss({
          [BOOKING_MODULE]: { booking_resource_id: dara.id },
          [Modules.PRODUCT]: { product_variant_id: short.id },
        })
        const { data: [shortAfter] } = await query.graph({
          entity: "product_variant",
          fields: ["id", "booking_resources.id"],
          filters: { id: short.id },
        })
        expect((shortAfter.booking_resources ?? []).map((r) => r?.id)).toEqual([sophea.id])
      })

      it("links several bookings to the one order they were paid in", async () => {
        const container = getContainer()
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)

        const room = await booking.createBookingResources({
          name: "Room 1",
          type: "room",
          capacity: 2,
          timezone: "Asia/Phnom_Penh",
        })
        const [first, second] = await booking.createBookings([
          {
            resource_id: room.id,
            starts_at: new Date("2026-11-20T02:00:00Z"),
            ends_at: new Date("2026-11-20T03:00:00Z"),
            status: "confirmed",
          },
          {
            resource_id: room.id,
            starts_at: new Date("2026-11-21T02:00:00Z"),
            ends_at: new Date("2026-11-21T03:00:00Z"),
            status: "confirmed",
          },
        ])
        const [order] = await container
          .resolve(Modules.ORDER)
          .createOrders([{ currency_code: "usd" }])

        await link.create(
          [first, second].map((b): LinkDefinition => ({
            [BOOKING_MODULE]: { booking_id: b.id },
            [Modules.ORDER]: { order_id: order.id },
          }))
        )

        // Order side: its bookings.
        const { data: [o] } = await query.graph({
          entity: "order",
          fields: ["id", "bookings.id", "bookings.starts_at"],
          filters: { id: order.id },
        })
        expect((o.bookings ?? []).map((b) => b?.id).sort()).toEqual([first.id, second.id].sort())

        // Booking side: one order each.
        const { data: bookings } = await query.graph({
          entity: "booking",
          fields: ["id", "order.id"],
          filters: { id: [first.id, second.id] },
        })
        expect(bookings).toHaveLength(2)
        for (const b of bookings) {
          expect(b.order?.id).toEqual(order.id)
        }
      })
    })
  },
})
