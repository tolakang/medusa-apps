import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow } from "@medusajs/medusa/core-flows"
import { SELLER_SUSPENDED_MESSAGE } from "../../src/api/seller-auth"

jest.setTimeout(120 * 1000)

// TASKS F-081 (plan §6.5): the shop activates or suspends a seller and sets
// their name, domain and commission rate (POST /admin/sellers/:id, the admin
// Sellers page). Before, a seller's status could only be set at the invite,
// so a seller invited as pending stayed pending.
medusaIntegrationTestRunner({
  env: { SELLER_CORS: "https://portal.seller.test" },
  testSuite: ({ api, getContainer }) => {
    describe("admin seller updates (TASKS F-081)", () => {
      let admin: { headers: Record<string, string> }
      let own: { headers: Record<string, string> }

      const call = (request: Promise<any>) =>
        request.then(
          (res) => res,
          (err) => err.response
        )
      const bearer = (token?: string) => ({
        headers: token ? { authorization: `Bearer ${token}` } : ({} as Record<string, string>),
      })

      beforeEach(async () => {
        const container = getContainer()
        await createDefaultsWorkflow(container).run()
        const {
          data: [key],
        } = await container
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        own = { headers: { "x-publishable-api-key": key.token } }

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
        admin = bearer(data.token)
      })

      const invite = (body: Record<string, unknown> = {}) =>
        call(
          api.post(
            "/admin/sellers",
            { handle: "sok-shop", name: "Sok Shop", email: "sok@seller.test", ...body },
            admin
          )
        )
      const update = (id: string, body: Record<string, unknown>, auth = admin) =>
        call(api.post(`/admin/sellers/${id}`, body, auth))
      const resolve = (domain: string) =>
        call(api.get(`/store/sellers/resolve?domain=${domain}`, own))

      // Invite, register, accept, sign in: the seller's own token.
      const onboard = async (invited: any) => {
        const registered = await api.post("/auth/seller/emailpass/register", {
          email: "sok@seller.test",
          password: "seller-pass-1",
        })
        await api.post(
          "/sellers/accept",
          { invite_code: invited.data.invite_code },
          bearer(registered.data.token)
        )
        return (
          await api.post("/auth/seller/emailpass", {
            email: "sok@seller.test",
            password: "seller-pass-1",
          })
        ).data.token as string
      }

      it("activates a pending seller, suspends and reactivates them", async () => {
        const invited = await invite({ domain: "shop.sok.com" })
        const id = invited.data.seller.id
        const token = await onboard(invited)
        // Pending: the domain shows the shop's own catalog.
        expect((await resolve("shop.sok.com")).status).toEqual(404)

        const activated = await update(id, { status: "active" })
        expect(activated.status).toEqual(200)
        expect(activated.data.seller).toEqual(
          expect.objectContaining({ id, status: "active", invite_code: invited.data.invite_code })
        )
        expect((await resolve("shop.sok.com")).data.publishable_key).toEqual(
          invited.data.publishable_key
        )
        expect((await call(api.get("/sellers/me", bearer(token)))).status).toEqual(200)

        // Suspended: the domain and the seller's sign-in stop working at once.
        expect((await update(id, { status: "suspended" })).data.seller.status).toEqual("suspended")
        expect((await resolve("shop.sok.com")).status).toEqual(404)
        const locked = await call(api.get("/sellers/me", bearer(token)))
        expect(locked.status).toEqual(401)
        expect(locked.data.message).toEqual(SELLER_SUSPENDED_MESSAGE)

        await update(id, { status: "active" })
        expect((await resolve("shop.sok.com")).status).toEqual(200)
        expect((await call(api.get("/sellers/me", bearer(token)))).status).toEqual(200)
      })

      it("changes name, domain and commission rate; null clears them", async () => {
        const invited = await invite({ status: "active" })
        const id = invited.data.seller.id
        const res = await update(id, { name: "Sok Goods", domain: "goods.sok.com", commission_rate: 12.5 })
        expect(res.status).toEqual(200)
        expect(res.data.seller).toEqual(
          expect.objectContaining({
            name: "Sok Goods",
            domain: "goods.sok.com",
            commission_rate: 12.5,
            handle: "sok-shop",
            email: "sok@seller.test",
          })
        )
        expect((await resolve("goods.sok.com")).status).toEqual(200)

        const cleared = await update(id, { domain: null, commission_rate: null })
        expect(cleared.data.seller).toEqual(expect.objectContaining({ domain: null, commission_rate: null }))
        expect((await resolve("goods.sok.com")).status).toEqual(404)
        expect((await call(api.get(`/admin/sellers/${id}`, admin))).data.seller.name).toEqual("Sok Goods")
      })

      it("one domain per seller, on invite and on update", async () => {
        const sok = await invite({ domain: "shop.sok.com" })
        const other = await invite({ handle: "dara", email: "dara@seller.test" })
        expect(other.status).toEqual(200)

        const taken = await update(other.data.seller.id, { domain: "shop.sok.com" })
        expect(taken.status).toEqual(422)
        expect(taken.data.message).toEqual("Another seller already uses the domain shop.sok.com.")
        expect((await invite({ handle: "mony", email: "mony@seller.test", domain: "shop.sok.com" })).status).toEqual(422)
        // Keeping one's own domain is fine.
        expect((await update(sok.data.seller.id, { domain: "shop.sok.com" })).status).toEqual(200)
      })

      it("refuses bad input, unknown sellers and other callers", async () => {
        const invited = await invite()
        const id = invited.data.seller.id
        for (const body of [
          { status: "deleted" },
          { domain: "Not A Host" },
          { domain: "localhost" },
          { commission_rate: 101 },
          { commission_rate: -1 },
          { name: "" },
          { email: "new@seller.test" },
          { handle: "new-handle" },
        ]) {
          expect((await update(id, body)).status).toEqual(400)
        }
        expect((await update("sel_missing", { status: "active" })).status).toEqual(404)
        expect((await call(api.get("/admin/sellers/sel_missing", admin))).status).toEqual(404)
        expect((await update(id, { status: "active" }, bearer())).status).toEqual(401)

        // The payouts route under the same path keeps its own body.
        expect((await call(api.post(`/admin/sellers/${id}/payouts`, {}, admin))).status).toEqual(200)
      })
    })
  },
})
