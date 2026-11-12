import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { IP_SECRET, marketplaceTestKit } from "../helpers/marketplace"

jest.setTimeout(240 * 1000)

// TASKS P6-07 (plan §6.6): the admin's routes behind the marketplace pages:
// product moderation, vendor child orders, and the parent/child split on the
// order page. (The vendor queue and payout report routes are tested in
// vendor-auth.spec.ts and vendor-payouts.spec.ts.)
medusaIntegrationTestRunner({
  env: { SHOPPER_IP_SECRET: IP_SECRET },
  testSuite: ({ api, getContainer }) => {
    describe("admin marketplace routes (TASKS P6-07)", () => {
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

      const product = (title: string, status?: string) => ({
        title,
        ...(status ? { status } : {}),
        options: [{ title: "Size", values: ["One size"] }],
        variants: [
          {
            title: "One size",
            options: { Size: "One size" },
            prices: [{ amount: 25, currency_code: "usd" }],
          },
        ],
      })

      it("moderates vendors' products: queue, publish, reject", async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        const sok = await kit.signUpVendor(admin, "sok@vendor.test", "Sok Goods")
        const scarf = await api.post("/vendors/products", product("Scarf", "proposed"), dara.auth)
        await api.post("/vendors/products", product("Draft lamp"), sok.auth)
        const mat = await api.post("/vendors/products", product("Mat", "proposed"), sok.auth)

        const queue = await call(api.get("/admin/vendor-products?status=proposed", admin))
        expect(queue.status).toBe(200)
        expect(queue.data.products.map((p: { title: string }) => p.title).sort()).toEqual(["Mat", "Scarf"])
        expect(
          queue.data.products.find((p: { title: string }) => p.title === "Scarf").vendor.name
        ).toBe("Dara Crafts")
        // The marketplace's own products (the seeded catalog) aren't listed.
        const all = await call(api.get("/admin/vendor-products", admin))
        expect(all.data.count).toBe(3)
        const onlySok = await call(api.get(`/admin/vendor-products?vendor_id=${sok.id}`, admin))
        expect(onlySok.data.count).toBe(2)

        const published = await call(
          api.post(`/admin/vendor-products/${scarf.data.product.id}/review`, { action: "publish" }, admin)
        )
        expect(published.status).toBe(200)
        expect(published.data.product.status).toBe("published")
        const rejected = await call(
          api.post(`/admin/vendor-products/${mat.data.product.id}/review`, { action: "reject" }, admin)
        )
        expect(rejected.data.product.status).toBe("rejected")
        // The vendor sees it.
        const mine = await call(api.get("/vendors/products", sok.auth))
        expect(
          mine.data.products.find((p: { title: string }) => p.title === "Mat").status
        ).toBe("rejected")

        // Bad action, someone else's (marketplace) product, unknown product,
        // and vendors calling the admin route.
        expect(
          (
            await call(
              api.post(`/admin/vendor-products/${scarf.data.product.id}/review`, { action: "hide" }, admin)
            )
          ).status
        ).toBe(400)
        const {
          data: [own],
        } = await kit.query().graph({ entity: "product", fields: ["id"], filters: { handle: "t-shirt" } })
        expect(
          (await call(api.post(`/admin/vendor-products/${own.id}/review`, { action: "reject" }, admin)))
            .status
        ).toBe(400)
        expect(
          (await call(api.post(`/admin/vendor-products/prod_missing/review`, { action: "publish" }, admin)))
            .status
        ).toBe(404)
        expect(
          (
            await call(
              api.post(`/admin/vendor-products/${mat.data.product.id}/review`, { action: "publish" }, sok.auth)
            )
          ).status
        ).toBe(401)
        expect((await call(api.get("/admin/vendor-products?status=hidden", admin))).status).toBe(400)
      })

      it("lists vendor child orders and shows the split on each order", async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        const sok = await kit.signUpVendor(admin, "sok@vendor.test", "Sok Goods")
        await kit.giveProducts(dara.id, ["t-shirt"])
        await kit.giveProducts(sok.id, ["sweatshirt"])
        const cartId = await kit.readyCart(shop, [
          { handle: "t-shirt", quantity: 1 },
          { handle: "sweatshirt", quantity: 1 },
        ])
        const res = await api.post(`/store/carts/${cartId}/complete-vendor`, {}, shop.store)
        const parentId = res.data.order.id
        const children = res.data.vendor_orders as { vendor_id: string; order_id: string }[]

        const list = await call(api.get("/admin/vendor-orders", admin))
        expect(list.status).toBe(200)
        expect(list.data.count).toBe(2)
        for (const o of list.data.orders) {
          expect(o.parent_order_id).toBe(parentId)
          expect(["Dara Crafts", "Sok Goods"]).toContain(o.vendor.name)
        }
        const daras = await call(api.get(`/admin/vendor-orders?vendor_id=${dara.id}`, admin))
        expect(daras.data.orders.map((o: { id: string }) => o.id)).toEqual([
          children.find((c) => c.vendor_id === dara.id)!.order_id,
        ])

        const parentSplit = await call(api.get(`/admin/orders/${parentId}/marketplace`, admin))
        expect(parentSplit.data.kind).toBe("parent")
        expect(parentSplit.data.child_orders.map((c: { id: string }) => c.id).sort()).toEqual(
          children.map((c) => c.order_id).sort()
        )
        const childSplit = await call(
          api.get(`/admin/orders/${children[0].order_id}/marketplace`, admin)
        )
        expect(childSplit.data).toEqual(
          expect.objectContaining({
            kind: "child",
            parent_order: expect.objectContaining({ id: parentId }),
          })
        )
        expect(childSplit.data.vendor.id).toBe(children[0].vendor_id)

        // An ordinary order (no vendor products) is "plain"; unknown is 404.
        const plainCart = await kit.readyCart(shop, [{ handle: "shorts", quantity: 1 }])
        const plain = await api.post(`/store/carts/${plainCart}/complete-vendor`, {}, shop.store)
        expect(
          (await call(api.get(`/admin/orders/${plain.data.order.id}/marketplace`, admin))).data
        ).toEqual({ kind: "plain" })
        expect((await call(api.get(`/admin/orders/order_missing/marketplace`, admin))).status).toBe(404)
        expect((await call(api.get("/admin/vendor-orders", dara.auth))).status).toBe(401)
      })
    })
  },
})
