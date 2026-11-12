import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { NOTHING_TO_FULFIL_MESSAGE } from "../../src/api/vendors/me/orders/[id]/fulfillments/route"
import { IP_SECRET, marketplaceTestKit } from "../helpers/marketplace"

jest.setTimeout(240 * 1000)

// TASKS P6-10 (plan §6.6 acceptance): a cart with items from two vendors
// produces two child orders that each vendor sees and fulfils separately,
// and only its own. Also the vendor portal's order routes (P6-09).
medusaIntegrationTestRunner({
  env: { SHOPPER_IP_SECRET: IP_SECRET },
  testSuite: ({ api, getContainer }) => {
    describe("vendor orders and fulfilment (TASKS P6-09, P6-10)", () => {
      const kit = marketplaceTestKit(api, getContainer)
      let shop: Awaited<ReturnType<typeof kit.setupShop>>
      let admin: { headers: Record<string, string> }

      beforeEach(async () => {
        shop = await kit.setupShop()
        admin = await kit.adminAuth()
      })

      const call = (request: Promise<any>) =>
        request.then(
          (res) => res,
          (err) => err.response
        )

      const stockOf = async (handle: string) => {
        const variantId = await kit.variantOf(handle)
        const {
          data: [variant],
        } = await kit.query().graph({
          entity: "product_variant",
          fields: ["inventory_items.inventory_item_id"],
          filters: { id: variantId },
        })
        const inventory = getContainer().resolve(Modules.INVENTORY)
        const levels = await inventory.listInventoryLevels({
          inventory_item_id: variant.inventory_items![0]!.inventory_item_id,
        })
        return {
          stocked: levels.reduce((s, l) => s + Number(l.stocked_quantity), 0),
          reserved: levels.reduce((s, l) => s + Number(l.reserved_quantity), 0),
        }
      }

      it("each vendor sees and fulfils only its own order (P6-10)", async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        const sok = await kit.signUpVendor(admin, "sok@vendor.test", "Sok Goods")
        await kit.giveProducts(dara.id, ["t-shirt"])
        await kit.giveProducts(sok.id, ["sweatshirt"])
        const before = await stockOf("t-shirt")
        const cartId = await kit.readyCart(shop, [
          { handle: "t-shirt", quantity: 2 },
          { handle: "sweatshirt", quantity: 1 },
        ])
        const placed = await api.post(`/store/carts/${cartId}/complete-vendor`, {}, shop.store)
        const parentId = placed.data.order.id
        const childOf = (vendorId: string) =>
          (placed.data.vendor_orders as { vendor_id: string; order_id: string }[]).find(
            (c) => c.vendor_id === vendorId
          )!.order_id

        // Each vendor lists one order: its own.
        const daraOrders = await call(api.get("/vendors/me/orders", dara.auth))
        expect(daraOrders.status).toBe(200)
        expect(daraOrders.data.orders.map((o: { id: string }) => o.id)).toEqual([childOf(dara.id)])
        const sokOrders = await call(api.get("/vendors/me/orders", sok.auth))
        expect(sokOrders.data.orders.map((o: { id: string }) => o.id)).toEqual([childOf(sok.id)])

        const mine = daraOrders.data.orders[0]
        expect(mine.items).toHaveLength(1)
        expect(Number(mine.items[0].quantity)).toBe(2)
        expect(mine.shipping_address.city).toBe("Khan Chamkar Mon")
        expect(mine.fully_fulfilled).toBe(false)
        expect(mine.commission).toEqual(expect.objectContaining({ rate: 10, status: "pending" }))

        // Someone else's order, or the customer's parent order: 404.
        for (const id of [childOf(sok.id), parentId]) {
          expect((await call(api.get(`/vendors/me/orders/${id}`, dara.auth))).status).toBe(404)
          expect(
            (await call(api.post(`/vendors/me/orders/${id}/fulfillments`, {}, dara.auth))).status
          ).toBe(404)
        }

        // Dara fulfils its order: stock taken from the reservation.
        const fulfilled = await call(
          api.post(`/vendors/me/orders/${childOf(dara.id)}/fulfillments`, {}, dara.auth)
        )
        expect(fulfilled.status).toBe(200)
        expect(fulfilled.data.order.fully_fulfilled).toBe(true)
        expect(fulfilled.data.order.fulfillments).toHaveLength(1)
        const after = await stockOf("t-shirt")
        expect(after.stocked).toBe(before.stocked - 2)
        expect(after.reserved).toBe(before.reserved)

        // Again: nothing left.
        const again = await call(
          api.post(`/vendors/me/orders/${childOf(dara.id)}/fulfillments`, {}, dara.auth)
        )
        expect(again.status).toBe(400)
        expect(again.data.message).toBe(NOTHING_TO_FULFIL_MESSAGE)

        // Sok's order is untouched until Sok fulfils it.
        const sokOrder = await call(api.get(`/vendors/me/orders/${childOf(sok.id)}`, sok.auth))
        expect(sokOrder.data.order.fully_fulfilled).toBe(false)
        const sokDone = await call(
          api.post(`/vendors/me/orders/${childOf(sok.id)}/fulfillments`, {}, sok.auth)
        )
        expect(sokDone.data.order.fully_fulfilled).toBe(true)
      })

      it("refuses other callers", async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        expect((await call(api.get("/vendors/me/orders", admin))).status).toBe(401)
        expect((await call(api.get("/vendors/me/orders"))).status).toBe(401)
        await api.post(`/admin/vendors/${dara.id}`, { status: "pending" }, admin)
        expect((await call(api.get("/vendors/me/orders", dara.auth))).status).toBe(403)
      })
    })
  },
})
