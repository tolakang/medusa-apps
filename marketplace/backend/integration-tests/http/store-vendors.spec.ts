import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { IP_SECRET, marketplaceTestKit } from "../helpers/marketplace"

jest.setTimeout(240 * 1000)

// TASKS P6-08 (plan §6.6): the storefront's vendor reads: a shop page per
// active vendor and "Sold by" per product.
medusaIntegrationTestRunner({
  env: { SHOPPER_IP_SECRET: IP_SECRET },
  testSuite: ({ api, getContainer }) => {
    describe("store vendor routes (TASKS P6-08)", () => {
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

      it("shows an active vendor's shop with its published products only", async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        await kit.giveProducts(dara.id, ["t-shirt", "sweatshirt"])
        const {
          data: [sweatshirt],
        } = await kit.query().graph({ entity: "product", fields: ["id"], filters: { handle: "sweatshirt" } })
        await api.post(`/admin/products/${sweatshirt.id}`, { status: "draft" }, admin)

        const res = await call(api.get("/store/vendors/dara-crafts", shop.store))
        expect(res.status).toBe(200)
        expect(res.data.vendor).toEqual(
          expect.objectContaining({ handle: "dara-crafts", name: "Dara Crafts" })
        )
        expect(res.data.vendor.status).toBeUndefined()
        const {
          data: [tshirt],
        } = await kit.query().graph({ entity: "product", fields: ["id"], filters: { handle: "t-shirt" } })
        expect(res.data.product_ids).toEqual([tshirt.id])

        // Suspended or unknown vendors have no shop; the publishable key is needed.
        await api.post(`/admin/vendors/${dara.id}`, { status: "suspended" }, admin)
        expect((await call(api.get("/store/vendors/dara-crafts", shop.store))).status).toBe(404)
        expect((await call(api.get("/store/vendors/nobody", shop.store))).status).toBe(404)
        expect((await call(api.get("/store/vendors/dara-crafts"))).status).toBe(400)
      })

      it("names the vendor of each product", async () => {
        const dara = await kit.signUpVendor(admin, "dara@vendor.test", "Dara Crafts")
        await kit.giveProducts(dara.id, ["t-shirt"])
        const { data: products } = await kit.query().graph({
          entity: "product",
          fields: ["id", "handle"],
          filters: { handle: ["t-shirt", "shorts"] },
        })
        const id = (h: string) => products.find((p) => p.handle === h)!.id
        const res = await call(
          api.get(`/store/product-vendors?product_id=${id("t-shirt")}&product_id=${id("shorts")}`, shop.store)
        )
        expect(res.status).toBe(200)
        expect(res.data.product_vendors).toEqual([
          { product_id: id("t-shirt"), vendor: { handle: "dara-crafts", name: "Dara Crafts" } },
        ])
        const one = await call(api.get(`/store/product-vendors?product_id=${id("t-shirt")}`, shop.store))
        expect(one.data.product_vendors).toHaveLength(1)
        expect((await call(api.get("/store/product-vendors", shop.store))).status).toBe(400)
      })
    })
  },
})
