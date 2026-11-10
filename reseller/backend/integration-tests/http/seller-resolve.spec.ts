import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow } from "@medusajs/medusa/core-flows"
import { SELLER_MODULE } from "../../src/modules/seller"
import SellerModuleService from "../../src/modules/seller/service"
import { createSellerWorkflow } from "../../src/workflows/seller/create-seller"

jest.setTimeout(120 * 1000)

// TASKS P5-07 (plan §6.5): the storefront resolves a request's seller, by
// domain (or handle), to their publishable key; only active sellers.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("GET /store/sellers/resolve (TASKS P5-07)", () => {
      let own: { headers: Record<string, string> }
      const call = (p: Promise<any>) => p.then((r) => r, (e) => e.response)
      const resolve = (query: string) => call(api.get(`/store/sellers/resolve?${query}`, own))

      beforeEach(async () => {
        await createDefaultsWorkflow(getContainer()).run()
        const {
          data: [key],
        } = await getContainer()
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        own = { headers: { "x-publishable-api-key": key.token } }
      })

      const newSeller = async (handle: string, domain: string | null, status = "active") =>
        (
          await createSellerWorkflow(getContainer()).run({
            input: {
              handle,
              name: handle,
              email: `${handle}@seller.test`,
              domain,
              status: status as "active",
            },
          })
        ).result

      it("finds an active seller by host, in any case, with a port", async () => {
        const sok = await newSeller("sok", "shop.sok.com")
        for (const host of ["shop.sok.com", "SHOP.Sok.com:8000", "shop.sok.com."]) {
          const res = await resolve(`domain=${encodeURIComponent(host)}`)
          expect(res.status).toEqual(200)
          expect(res.data).toEqual({
            seller: { handle: "sok", name: "sok", domain: "shop.sok.com" },
            publishable_key: sok.publishable_key.token,
          })
        }
        expect((await resolve("handle=sok")).data.publishable_key).toEqual(sok.publishable_key.token)
      })

      it("is 404 for unknown hosts and for pending or suspended sellers", async () => {
        await newSeller("pending", "pending.shop.com", "pending")
        await newSeller("gone", "gone.shop.com", "suspended")
        for (const query of [
          "domain=nobody.shop.com",
          "domain=pending.shop.com",
          "domain=gone.shop.com",
          "handle=pending",
          "domain=not%20a%20host",
        ]) {
          expect((await resolve(query)).status).toEqual(404)
        }
      })

      it("is 404 once the seller's key is revoked", async () => {
        const sok = await newSeller("sok", "shop.sok.com")
        await getContainer().resolve(Modules.API_KEY).revoke(sok.publishable_key.id, {
          revoked_by: "test",
        })
        expect((await resolve("domain=shop.sok.com")).status).toEqual(404)
      })

      it("needs exactly one of domain or handle, and a publishable key", async () => {
        expect((await resolve("")).status).toEqual(400)
        expect((await resolve("domain=a.com&handle=a")).status).toEqual(400)
        expect((await resolve("domain=a.com&other=1")).status).toEqual(400)
        expect(
          (await call(api.get("/store/sellers/resolve?handle=sok"))).status
        ).toEqual(400)
      })

      it("suspending a seller takes effect at once", async () => {
        const sok = await newSeller("sok", "shop.sok.com")
        expect((await resolve("domain=shop.sok.com")).status).toEqual(200)
        await getContainer()
          .resolve<SellerModuleService>(SELLER_MODULE)
          .updateSellers({ id: sok.seller.id, status: "suspended" })
        expect((await resolve("domain=shop.sok.com")).status).toEqual(404)
      })
    })
  },
})
