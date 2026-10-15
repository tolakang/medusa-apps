import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import type { LinkDefinition } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../../src/modules/pos"
import type PosModuleService from "../../src/modules/pos/service"

// TASKS P2-02: register → stock location, register → sales channel,
// shift → orders (BUILD_PLAN §6.2), created with the Link service and read
// back with Query in both directions.
jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("POS links (TASKS P2-02)", () => {
      it("links registers to a stock location and a sales channel, and orders to a shift", async () => {
        const container = getContainer()
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const pos = container.resolve<PosModuleService>(POS_MODULE)

        const [front, back] = await pos.createPosRegisters([
          { name: "Front till", code: "LNK-01" },
          { name: "Back till", code: "LNK-02" },
        ])
        const shift = await pos.createPosShifts({
          register_id: front.id,
          opened_by: "cashier_1",
          opened_at: new Date(),
          currency_code: "usd",
          opening_cash: 20,
        })
        const location = await container
          .resolve(Modules.STOCK_LOCATION)
          .createStockLocations({ name: "Phnom Penh shop" })
        const channel = await container
          .resolve(Modules.SALES_CHANNEL)
          .createSalesChannels({ name: "Phnom Penh POS" })
        const [orderA, orderB] = await container
          .resolve(Modules.ORDER)
          .createOrders([{ currency_code: "usd" }, { currency_code: "usd" }])

        const links: LinkDefinition[] = [
          ...[front, back].flatMap((r): LinkDefinition[] => [
            {
              [POS_MODULE]: { pos_register_id: r.id },
              [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
            },
            {
              [POS_MODULE]: { pos_register_id: r.id },
              [Modules.SALES_CHANNEL]: { sales_channel_id: channel.id },
            },
          ]),
          ...[orderA, orderB].map((o): LinkDefinition => ({
            [POS_MODULE]: { pos_shift_id: shift.id },
            [Modules.ORDER]: { order_id: o.id },
          })),
        ]
        await link.create(links)

        // Register side: one location, one channel each.
        const { data: registers } = await query.graph({
          entity: "pos_register",
          fields: ["id", "stock_location.id", "sales_channel.id"],
          filters: { id: [front.id, back.id] },
        })
        expect(registers).toHaveLength(2)
        for (const r of registers) {
          expect(r.stock_location?.id).toEqual(location.id)
          expect(r.sales_channel?.id).toEqual(channel.id)
        }

        // Location and channel side: many registers.
        const { data: [loc] } = await query.graph({
          entity: "stock_location",
          fields: ["id", "pos_registers.id"],
          filters: { id: location.id },
        })
        expect((loc.pos_registers ?? []).map((r) => r?.id).sort()).toEqual([front.id, back.id].sort())

        const { data: [sc] } = await query.graph({
          entity: "sales_channel",
          fields: ["id", "pos_registers.id"],
          filters: { id: channel.id },
        })
        expect((sc.pos_registers ?? []).map((r) => r?.id).sort()).toEqual([front.id, back.id].sort())

        // Shift side: many orders; order side: its shift.
        const { data: [s] } = await query.graph({
          entity: "pos_shift",
          fields: ["id", "orders.id"],
          filters: { id: shift.id },
        })
        expect((s.orders ?? []).map((o) => o?.id).sort()).toEqual([orderA.id, orderB.id].sort())

        const { data: [order] } = await query.graph({
          entity: "order",
          fields: ["id", "pos_shift.id"],
          filters: { id: orderA.id },
        })
        expect(order.pos_shift?.id).toEqual(shift.id)
      })
    })
  },
})
