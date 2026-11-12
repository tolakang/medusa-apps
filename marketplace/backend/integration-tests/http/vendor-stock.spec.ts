import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { NOT_TRACKED_MESSAGE } from "../../src/api/vendors/products/[id]/stock/route"
import { STOCK_QUANTITY_MESSAGE } from "../../src/api/vendors/products/route"
import { IP_SECRET, marketplaceTestKit } from "../helpers/marketplace"

jest.setTimeout(240 * 1000)

// TASKS P6-15 (owner 2026-11-12, F-080: "track it"): each approved vendor has
// its own stock location in the store's sales channel; a vendor's product
// starts with the stock the vendor gives; checkout refuses what isn't in
// stock; fulfilling takes the vendor's own stock. Made-to-order products
// (manage_inventory: false) aren't tracked.
medusaIntegrationTestRunner({
  env: { SHOPPER_IP_SECRET: IP_SECRET, MARKETPLACE_REQUIRE_PRODUCT_APPROVAL: "false" },
  testSuite: ({ api, getContainer }) => {
    describe("vendor stock (TASKS P6-15)", () => {
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

      const product = (title: string, extra: { manage?: boolean; stock?: unknown } = {}) => ({
        title,
        status: "published",
        options: [{ title: "Default", values: ["Default"] }],
        variants: [
          {
            title: "Default",
            manage_inventory: extra.manage ?? true,
            options: { Default: "Default" },
            prices: [{ amount: 20, currency_code: "usd" }],
          },
        ],
        ...(extra.stock !== undefined ? { additional_data: { stock_quantity: extra.stock } } : {}),
      })

      const locationOf = async (vendorId: string) => {
        const {
          data: [vendor],
        } = await kit.query().graph({
          entity: "vendor",
          fields: ["stock_locations.id", "stock_locations.name", "stock_locations.sales_channels.id"],
          filters: { id: vendorId },
        })
        return vendor.stock_locations ?? []
      }

      it("an approved vendor gets one stock location in the store's sales channel", async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        const [location, ...more] = await locationOf(dara.id)
        expect(more).toEqual([])
        expect(location!.name).toBe("Vendor: Dara Crafts")
        const {
          data: [store],
        } = await kit.query().graph({ entity: "store", fields: ["default_sales_channel_id"] })
        expect(location!.sales_channels?.map((c) => c?.id)).toEqual([store.default_sales_channel_id])

        // Approving again (e.g. after a suspension) makes no second one.
        await api.post(`/admin/vendors/${dara.id}`, { status: "suspended" }, admin)
        await api.post(`/admin/vendors/${dara.id}`, { status: "active" }, admin)
        expect(await locationOf(dara.id)).toHaveLength(1)
      })

      it("products start with the vendor's stock; made-to-order ones aren't tracked", async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        const sok = await kit.signUpVendor(admin, "sok@vendor.test", "Sok Goods")
        const tracked = await call(api.post("/vendors/products", product("Basket", { stock: 3 }), dara.auth))
        expect(tracked.status).toBe(201)
        expect(tracked.data.product.stock).toEqual({ tracked: true, quantity: 3, available: 3 })
        const toOrder = await call(api.post("/vendors/products", product("Portrait", { manage: false }), dara.auth))
        expect(toOrder.data.product.stock).toEqual({ tracked: false, quantity: null, available: null })
        const noStock = await call(api.post("/vendors/products", product("Mat"), dara.auth))
        expect(noStock.data.product.stock).toEqual({ tracked: true, quantity: 0, available: 0 })

        for (const bad of [-1, 1.5, "3"]) {
          const res = await call(api.post("/vendors/products", product("Bad", { stock: bad }), dara.auth))
          expect(res.status).toBe(400)
          expect(res.data.message).toBe(STOCK_QUANTITY_MESSAGE)
        }

        // The stock sits at Dara's own location.
        const [location] = await locationOf(dara.id)
        const levels = await getContainer()
          .resolve(Modules.INVENTORY)
          .listInventoryLevels({ location_id: location!.id })
        expect(levels.map((l) => Number(l.stocked_quantity)).sort()).toEqual([0, 3])

        // Edit the stock later.
        const id = tracked.data.product.id
        const set = await call(api.post(`/vendors/products/${id}/stock`, { quantity: 5 }, dara.auth))
        expect(set.status).toBe(200)
        expect(set.data.stock).toEqual({ tracked: true, quantity: 5, available: 5 })
        const list = await call(api.get("/vendors/products", dara.auth))
        expect(list.data.products.find((p: { id: string }) => p.id === id).stock.quantity).toBe(5)

        const notTracked = await call(
          api.post(`/vendors/products/${toOrder.data.product.id}/stock`, { quantity: 1 }, dara.auth)
        )
        expect(notTracked.status).toBe(400)
        expect(notTracked.data.message).toBe(NOT_TRACKED_MESSAGE)
        expect((await call(api.post(`/vendors/products/${id}/stock`, { quantity: -2 }, dara.auth))).status).toBe(400)
        expect((await call(api.post(`/vendors/products/${id}/stock`, { quantity: 2 }, sok.auth))).status).toBe(404)
        expect((await call(api.post(`/vendors/products/${id}/stock`, { quantity: 2 }, admin))).status).toBe(401)
      })

      it("checkout refuses more than the vendor has; fulfilling takes the vendor's stock", async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        const created = await api.post("/vendors/products", product("Basket", { stock: 3 }), dara.auth)
        const variantId = created.data.product.variants[0].id
        const [location] = await locationOf(dara.id)
        const level = async () => {
          const [l] = await getContainer()
            .resolve(Modules.INVENTORY)
            .listInventoryLevels({ location_id: location!.id })
          return { stocked: Number(l.stocked_quantity), reserved: Number(l.reserved_quantity) }
        }

        // More than in stock: refused when adding to the cart.
        const {
          data: { cart: big },
        } = await api.post("/store/carts", { region_id: shop.regionId }, shop.store)
        const tooMany = await call(
          api.post(`/store/carts/${big.id}/line-items`, { variant_id: variantId, quantity: 4 }, shop.store)
        )
        expect(tooMany.status).toBeGreaterThanOrEqual(400)

        // Two of three: placed, reserved at Dara's location for its child order.
        const cartId = await kit.readyCart(shop, [{ handle: created.data.product.handle, quantity: 2 }])
        const placed = await call(api.post(`/store/carts/${cartId}/complete-vendor`, {}, shop.store))
        expect(placed.status).toBe(200)
        const childId = placed.data.vendor_orders[0].order_id
        expect(await level()).toEqual({ stocked: 3, reserved: 2 })

        // Dara fulfils: Dara's stock goes from 3 to 1.
        const done = await call(api.post(`/vendors/me/orders/${childId}/fulfillments`, {}, dara.auth))
        expect(done.status).toBe(200)
        expect(await level()).toEqual({ stocked: 1, reserved: 0 })
        const list = await call(api.get("/vendors/products", dara.auth))
        expect(list.data.products[0].stock).toEqual({ tracked: true, quantity: 1, available: 1 })
      })
    })
  },
})
