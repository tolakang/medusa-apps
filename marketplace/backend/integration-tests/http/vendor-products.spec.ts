import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import { VENDOR_PENDING_MESSAGE } from "../../src/api/vendor-auth"
import { VENDOR_PRODUCT_NEEDS_APPROVAL_MESSAGE } from "../../src/lib/vendor-product-status"

jest.setTimeout(120 * 1000)

// TASKS P6-04 (plan §6.6): create-vendor-product as in the official Vendors
// example: the product goes into the store's default sales channel and is
// linked to the vendor; it stays unpublished until the marketplace publishes
// it while MARKETPLACE_REQUIRE_PRODUCT_APPROVAL is on (F-075).
medusaIntegrationTestRunner({
  env: { SHOPPER_IP_SECRET: "test-ip-secret" },
  testSuite: ({ api, getContainer }) => {
    describe("vendor products (TASKS P6-04)", () => {
      let admin: { headers: Record<string, string> }
      let defaultChannelId: string
      let ip = 0

      const call = (request: Promise<any>) =>
        request.then(
          (res) => res,
          (err) => err.response
        )
      const freshIp = () => ({
        "x-shopper-ip-secret": "test-ip-secret",
        "x-shopper-ip": `10.1.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`,
      })
      const bearer = (token?: string): { headers: Record<string, string> } => ({
        headers: { ...freshIp(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      })

      beforeEach(async () => {
        const container = getContainer()
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        const {
          data: [store],
        } = await container
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({ entity: "store", fields: ["default_sales_channel_id"] })
        defaultChannelId = store.default_sales_channel_id!

        const email = "admin@marketplace.test"
        const user = await container.resolve(Modules.USER).createUsers({ email })
        await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { user_id: user.id },
        })
        await container
          .resolve(Modules.AUTH)
          .updateProvider("emailpass", { entity_id: email, password: "supersecret1" })
        const { data } = await api.post("/auth/user/emailpass", {
          email,
          password: "supersecret1",
        })
        admin = bearer(data.token)
      })

      // Sign up a vendor, optionally approve it, and sign in.
      const vendor = async (email: string, name: string, approved = true) => {
        const password = "vendor-pass-1"
        const reg = await api.post(
          "/auth/vendor/emailpass/register",
          { email, password },
          { headers: freshIp() }
        )
        const created = await api.post("/vendors", { name }, bearer(reg.data.token))
        if (approved) {
          await api.post(
            `/admin/vendors/${created.data.vendor.id}`,
            { status: "active" },
            admin
          )
        }
        const login = await api.post(
          "/auth/vendor/emailpass",
          { email, password },
          { headers: freshIp() }
        )
        return { id: created.data.vendor.id as string, auth: bearer(login.data.token) }
      }

      const product = (title: string, extra: Record<string, unknown> = {}) => ({
        title,
        options: [{ title: "Size", values: ["One size"] }],
        variants: [
          {
            title: "One size",
            sku: `${title.toUpperCase().replace(/\s+/g, "-")}-1`,
            options: { Size: "One size" },
            prices: [{ amount: 25, currency_code: "usd" }],
          },
        ],
        ...extra,
      })

      it("an approved vendor adds a draft product in the default channel, linked to it", async () => {
        const dara = await vendor("dara@vendor.test", "Dara Crafts")
        const res = await call(api.post("/vendors/products", product("Silk Scarf"), dara.auth))
        expect(res.status).toBe(201)
        expect(res.data.product).toEqual(
          expect.objectContaining({ title: "Silk Scarf", status: "draft" })
        )
        expect(res.data.product.variants[0]).toEqual(
          expect.objectContaining({ sku: "SILK-SCARF-1" })
        )

        const {
          data: [stored],
        } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({
            entity: "product",
            fields: ["id", "vendor.id", "sales_channels.id"],
            filters: { id: res.data.product.id },
          })
        expect(stored.vendor?.id).toBe(dara.id)
        expect(stored.sales_channels?.map((c) => c?.id)).toEqual([defaultChannelId])
      })

      it("ignores the vendor's sales channels", async () => {
        const dara = await vendor("dara@vendor.test", "Dara Crafts")
        const res = await call(
          api.post(
            "/vendors/products",
            product("Basket", { sales_channels: [{ id: "sc_someone_elses" }] }),
            dara.auth
          )
        )
        expect(res.status).toBe(201)
        const {
          data: [stored],
        } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({
            entity: "product",
            fields: ["sales_channels.id"],
            filters: { id: res.data.product.id },
          })
        expect(stored.sales_channels?.map((c) => c?.id)).toEqual([defaultChannelId])
      })

      it("can't publish while approval is required; proposed marks it for review", async () => {
        const dara = await vendor("dara@vendor.test", "Dara Crafts")
        const published = await call(
          api.post("/vendors/products", product("Mat", { status: "published" }), dara.auth)
        )
        expect(published.status).toBe(400)
        expect(published.data.message).toBe(VENDOR_PRODUCT_NEEDS_APPROVAL_MESSAGE)
        const proposed = await call(
          api.post("/vendors/products", product("Mat", { status: "proposed" }), dara.auth)
        )
        expect(proposed.status).toBe(201)
        expect(proposed.data.product.status).toBe("proposed")
        // Nothing public until the marketplace publishes it.
        const { data } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({ entity: "product", fields: ["id"], filters: { status: "published" } })
        expect(data).toEqual([])
      })

      it("publishes at once when approval is switched off", async () => {
        const before = process.env.MARKETPLACE_REQUIRE_PRODUCT_APPROVAL
        process.env.MARKETPLACE_REQUIRE_PRODUCT_APPROVAL = "false"
        try {
          const dara = await vendor("dara@vendor.test", "Dara Crafts")
          const res = await call(
            api.post("/vendors/products", product("Mat", { status: "published" }), dara.auth)
          )
          expect(res.status).toBe(201)
          expect(res.data.product.status).toBe("published")
        } finally {
          if (before === undefined) {
            delete process.env.MARKETPLACE_REQUIRE_PRODUCT_APPROVAL
          } else {
            process.env.MARKETPLACE_REQUIRE_PRODUCT_APPROVAL = before
          }
        }
      })

      it("lists only the vendor's own products", async () => {
        const dara = await vendor("dara@vendor.test", "Dara Crafts")
        const sok = await vendor("sok@vendor.test", "Sok Goods")
        await api.post("/vendors/products", product("Scarf"), dara.auth)
        await api.post("/vendors/products", product("Basket"), dara.auth)
        await api.post("/vendors/products", product("Lamp"), sok.auth)

        const mine = await call(api.get("/vendors/products", dara.auth))
        expect(mine.status).toBe(200)
        expect(mine.data.products.map((p: { title: string }) => p.title).sort()).toEqual([
          "Basket",
          "Scarf",
        ])
        expect(mine.data.count).toBe(2)
        const theirs = await call(api.get("/vendors/products", sok.auth))
        expect(theirs.data.products.map((p: { title: string }) => p.title)).toEqual(["Lamp"])
      })

      it("refuses a bad body, a pending vendor and other actors", async () => {
        const dara = await vendor("dara@vendor.test", "Dara Crafts")
        expect((await call(api.post("/vendors/products", {}, dara.auth))).status).toBe(400)
        expect(
          (
            await call(
              api.post("/vendors/products", product("X", { status: "rejected" }), dara.auth)
            )
          ).status
        ).toBe(400)

        const pending = await vendor("new@vendor.test", "New Shop", false)
        const res = await call(api.post("/vendors/products", product("Y"), pending.auth))
        expect(res.status).toBe(403)
        expect(res.data.message).toBe(VENDOR_PENDING_MESSAGE)

        expect((await call(api.post("/vendors/products", product("Z"), admin))).status).toBe(401)
        expect((await call(api.get("/vendors/products"))).status).toBe(401)
      })
    })
  },
})
