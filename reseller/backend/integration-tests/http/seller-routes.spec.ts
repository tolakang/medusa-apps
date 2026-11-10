import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createProductsWorkflow,
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"
import { SELLER_MODULE } from "../../src/modules/seller"
import SellerModuleService from "../../src/modules/seller/service"

jest.setTimeout(240 * 1000)

// TASKS P5-06 (plan §6.5): /sellers/me/products (the seller picks which of
// your products show in their channel) and /sellers/me/commissions.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("seller routes (TASKS P5-06)", () => {
      let admin: { headers: Record<string, string> }
      const call = (p: Promise<any>) => p.then((r) => r, (e) => e.response)
      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } })

      // Invite, register, accept, sign in (P5-03).
      const sellerLogin = async (handle: string) => {
        const email = `${handle}@seller.test`
        const invited = await api.post(
          "/admin/sellers",
          { handle, name: handle, email, status: "active" },
          admin
        )
        const reg = await api.post("/auth/seller/emailpass/register", {
          email,
          password: "seller-pass-1",
        })
        await api.post("/sellers/accept", {}, bearer(reg.data.token))
        const { data } = await api.post("/auth/seller/emailpass", {
          email,
          password: "seller-pass-1",
        })
        return {
          id: invited.data.seller.id as string,
          key: invited.data.publishable_key as string,
          auth: bearer(data.token),
        }
      }

      beforeEach(async () => {
        const container = getContainer()
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seedInitialData({ container })

        const email = "admin@shop.test"
        const user = await container.resolve(Modules.USER).createUsers({ email })
        await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { user_id: user.id },
        })
        await container
          .resolve(Modules.AUTH)
          .updateProvider("emailpass", { entity_id: email, password: "supersecret1" })
        const { data } = await api.post("/auth/user/emailpass", { email, password: "supersecret1" })
        admin = { headers: { authorization: `Bearer ${data.token}` } }
      })

      it("a seller picks your products for their channel, and their storefront key shows them", async () => {
        const seller = await sellerLogin("sok")
        const list = (await api.get("/sellers/me/products", seller.auth)).data
        expect(list.count).toBeGreaterThan(1)
        expect(list.products.every((p) => p.selected === false)).toBe(true)

        const [first, second] = list.products
        const added = await api.post(
          "/sellers/me/products",
          { add: [first.id, second.id] },
          seller.auth
        )
        expect(added.data.products.filter((p) => p.selected).map((p) => p.id).sort()).toEqual(
          [first.id, second.id].sort()
        )

        const shown = async () =>
          (
            await api.get("/store/products?fields=id", {
              headers: { "x-publishable-api-key": seller.key },
            })
          ).data.products.map((p) => p.id)
        expect((await shown()).sort()).toEqual([first.id, second.id].sort())

        await api.post("/sellers/me/products", { remove: [first.id] }, seller.auth)
        expect(await shown()).toEqual([second.id])
      })

      it("only your published products can be offered", async () => {
        const seller = await sellerLogin("sok")
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const {
          data: [store],
        } = await query.graph({ entity: "store", fields: ["default_sales_channel_id"] })
        const {
          result: [elsewhere],
        } = await createSalesChannelsWorkflow(container).run({
          input: { salesChannelsData: [{ name: "Elsewhere" }] },
        })
        const { result: products } = await createProductsWorkflow(container).run({
          input: {
            products: [
              { title: "Draft thing", status: ProductStatus.DRAFT, channel: String(store.default_sales_channel_id) },
              { title: "Not yours", status: ProductStatus.PUBLISHED, channel: elsewhere.id },
            ].map(({ title, status, channel }) => ({
              title,
              status,
              sales_channels: [{ id: channel }],
              options: [{ title: "Size", values: ["One size"] }],
            })),
          },
        })

        const listed = (await api.get("/sellers/me/products", seller.auth)).data.products
        for (const product of products) {
          expect(listed.map((p) => p.id)).not.toContain(product.id)
          const res = await call(
            api.post("/sellers/me/products", { add: [product.id] }, seller.auth)
          )
          expect(res.status).toEqual(400)
          expect(res.data.message).toContain("can't be offered")
        }
        expect(
          (await call(api.post("/sellers/me/products", { add: ["prod_missing"] }, seller.auth))).status
        ).toEqual(400)
        const id = listed[0].id
        expect(
          (await call(api.post("/sellers/me/products", { add: [id], remove: [id] }, seller.auth))).status
        ).toEqual(400)
        expect(
          (await call(api.post("/sellers/me/products", { add: [id], price: 1 }, seller.auth))).status
        ).toEqual(400)
      })

      it("a seller sees only their own commissions, newest first, with totals", async () => {
        const sok = await sellerLogin("sok")
        const dara = await sellerLogin("dara")
        const sellers = getContainer().resolve<SellerModuleService>(SELLER_MODULE)
        let n = 0
        const commission = async (sellerId: string, amount: number, status = "pending") => {
          const c = await sellers.createSellerCommissions({
            seller_id: sellerId,
            order_id: `order_${++n}`,
            order_total: amount * 10,
            rate: 10,
            amount,
            currency_code: "usd",
            status: status as "pending",
          })
          await new Promise((resolve) => setTimeout(resolve, 15))
          return c
        }
        await commission(sok.id, 1.5)
        await commission(sok.id, 2.25, "approved")
        await commission(sok.id, 4, "paid")
        const newest = await commission(sok.id, 0.5)
        await commission(dara.id, 99)

        const { data } = await api.get("/sellers/me/commissions", sok.auth)
        expect(data.count).toEqual(4)
        expect(data.commissions[0].id).toEqual(newest.id)
        expect(data.commissions.map((c) => c.amount)).not.toContain(99)
        expect(data.totals).toEqual({
          pending: { usd: 2 },
          approved: { usd: 2.25 },
          paid: { usd: 4 },
        })

        const paged = (await api.get("/sellers/me/commissions?limit=2&offset=1", sok.auth)).data
        expect(paged.commissions).toHaveLength(2)
        expect(paged.count).toEqual(4)
        const approved = (await api.get("/sellers/me/commissions?status=approved", sok.auth)).data
        expect(approved.commissions.map((c) => c.amount)).toEqual([2.25])

        expect(
          (await call(api.get("/sellers/me/commissions?status=lost", sok.auth))).status
        ).toEqual(400)
        expect(
          (await call(api.get("/sellers/me/commissions?limit=500", sok.auth))).status
        ).toEqual(400)
        expect((await api.get("/sellers/me/commissions", dara.auth)).data.count).toEqual(1)
      })

      it("needs a signed-in seller", async () => {
        for (const path of ["/sellers/me/products", "/sellers/me/commissions"]) {
          expect((await call(api.get(path))).status).toEqual(401)
          expect((await call(api.get(path, admin))).status).toEqual(401)
        }
      })
    })
  },
})
