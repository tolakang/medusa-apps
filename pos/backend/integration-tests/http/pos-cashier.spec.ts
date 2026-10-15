import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import jwt from "jsonwebtoken"
import { POS_MODULE } from "../../src/modules/pos"
import type PosModuleService from "../../src/modules/pos/service"

// TASKS P2-03: the `cashier` actor type, invite-only (BUILD_PLAN §6.2). Real
// routes: an admin invites, the cashier registers with Medusa's emailpass
// routes, accepts the invitation and signs in. Tokens for admins and customers
// are signed with the test secret (Medusa's default "supersecret"), as in
// checkout-acceptance.spec.ts.
jest.setTimeout(180 * 1000)

const SECRET = "supersecret"
const PASSWORD = "cashier-pass-123"
const POS_ORIGIN = "http://pos.example.test"

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Cashier actor type (TASKS P2-03)", () => {
      beforeAll(() => {
        process.env.POS_CORS = POS_ORIGIN
      })
      afterAll(() => {
        delete process.env.POS_CORS
      })

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } })
      // The status of a refused request (axios throws on 4xx).
      const fail = (p: Promise<unknown>): Promise<{ status: number; data?: { message?: string } }> =>
        p.then(() => ({ status: 200 })).catch((e) => e.response)

      const adminAuth = async () => {
        const container = getContainer()
        const user = await container.resolve(Modules.USER).createUsers({ email: `admin-${Date.now()}@example.com` })
        const identity = await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: user.email }],
          app_metadata: { user_id: user.id },
        })
        return bearer(
          jwt.sign({ actor_id: user.id, actor_type: "user", auth_identity_id: identity.id }, SECRET, {
            expiresIn: "1d",
          })
        )
      }

      const invite = async (email: string, name = "Sokha") => {
        const { data } = await api.post("/admin/pos/cashiers", { name, email }, await adminAuth())
        return data.cashier
      }
      const register = async (email: string) => {
        const { data } = await api.post("/auth/cashier/emailpass/register", { email, password: PASSWORD })
        return data.token as string
      }
      const signIn = async (email: string) => {
        const { data } = await api.post("/auth/cashier/emailpass", { email, password: PASSWORD })
        return data.token as string
      }

      it("an invited cashier registers, accepts, signs in and reads /pos/cashiers/me", async () => {
        const cashier = await invite("Cashier.One@Example.com")
        expect(cashier).toEqual(
          expect.objectContaining({ email: "cashier.one@example.com", name: "Sokha", is_active: true })
        )

        const registration = await register("cashier.one@example.com")
        const { data: accepted } = await api.post("/pos/cashiers/accept", {}, bearer(registration))
        expect(accepted.cashier.id).toEqual(cashier.id)

        const token = await signIn("cashier.one@example.com")
        const { data: me } = await api.get("/pos/cashiers/me", bearer(token))
        expect(me.cashier).toEqual(expect.objectContaining({ id: cashier.id, email: cashier.email }))

        // A signed-in cashier can't accept again.
        expect((await fail(api.post("/pos/cashiers/accept", {}, bearer(token)))).status).toEqual(400)
      })

      it("refuses a registration without an invitation", async () => {
        const registration = await register("stranger@example.com")
        const res = await fail(api.post("/pos/cashiers/accept", {}, bearer(registration)))
        expect(res.status).toEqual(400)
        expect(res.data?.message).toContain("no active cashier invitation")

        // Medusa still signs the identity in, but the token has no cashier, so
        // every /pos route refuses it.
        const token = await signIn("stranger@example.com")
        expect((await fail(api.get("/pos/cashiers/me", bearer(token)))).status).toEqual(401)
      })

      it("a registration token alone can't use other /pos routes", async () => {
        await invite("pending@example.com")
        const registration = await register("pending@example.com")
        expect((await fail(api.get("/pos/cashiers/me", bearer(registration)))).status).toEqual(401)
      })

      it("a deactivated cashier is locked out at once", async () => {
        const cashier = await invite("leaver@example.com")
        await api.post("/pos/cashiers/accept", {}, bearer(await register("leaver@example.com")))
        const token = await signIn("leaver@example.com")
        expect((await api.get("/pos/cashiers/me", bearer(token))).status).toEqual(200)

        await getContainer()
          .resolve<PosModuleService>(POS_MODULE)
          .updatePosCashiers({ id: cashier.id, is_active: false })
        expect((await fail(api.get("/pos/cashiers/me", bearer(token)))).status).toEqual(401)
      })

      it("an inactive invitation can't be accepted", async () => {
        const cashier = await invite("inactive@example.com")
        await getContainer()
          .resolve<PosModuleService>(POS_MODULE)
          .updatePosCashiers({ id: cashier.id, is_active: false })
        const res = await fail(api.post("/pos/cashiers/accept", {}, bearer(await register("inactive@example.com"))))
        expect(res.status).toEqual(400)
      })

      it("cashiers can't use the admin API, and admins or customers can't use /pos", async () => {
        await invite("till@example.com")
        await api.post("/pos/cashiers/accept", {}, bearer(await register("till@example.com")))
        const cashierToken = await signIn("till@example.com")

        // P2-13 (acceptance): a cashier token can't call /admin/*.
        expect((await fail(api.get("/admin/products", bearer(cashierToken)))).status).toEqual(401)
        expect((await fail(api.get("/admin/pos/cashiers", bearer(cashierToken)))).status).toEqual(401)

        const admin = await adminAuth()
        expect((await fail(api.get("/pos/cashiers/me", admin))).status).toEqual(401)

        const customer = await getContainer().resolve(Modules.CUSTOMER).createCustomers({ email: "shopper@example.com" })
        const customerToken = jwt.sign({ actor_id: customer.id, actor_type: "customer" }, SECRET, { expiresIn: "1d" })
        expect((await fail(api.get("/pos/cashiers/me", bearer(customerToken)))).status).toEqual(401)

        expect((await fail(api.get("/pos/cashiers/me"))).status).toEqual(401)
      })

      it("admins invite with a valid, unique email; customers can't invite", async () => {
        const admin = await adminAuth()
        expect((await fail(api.post("/admin/pos/cashiers", { name: "X", email: "not-an-email" }, admin))).status).toEqual(400)
        expect((await fail(api.post("/admin/pos/cashiers", { name: "", email: "x@example.com" }, admin))).status).toEqual(400)

        await api.post("/admin/pos/cashiers", { name: "A", email: "dup@example.com" }, admin)
        const dup = await fail(api.post("/admin/pos/cashiers", { name: "B", email: "DUP@example.com" }, admin))
        expect(dup.status).toEqual(422)

        const { data } = await api.get("/admin/pos/cashiers", admin)
        expect(data.cashiers.map((c: { email: string }) => c.email)).toContain("dup@example.com")

        expect((await fail(api.post("/admin/pos/cashiers", { name: "C", email: "c@example.com" }))).status).toEqual(401)
      })

      it("cashier sign-up needs a password of at least 8 characters", async () => {
        await invite("short@example.com")
        const res = await fail(api.post("/auth/cashier/emailpass/register", { email: "short@example.com", password: "123" }))
        expect(res.status).toEqual(400)
      })

      it("/pos answers CORS for POS_CORS origins only", async () => {
        const allowed = await fail(api.get("/pos/cashiers/me", { headers: { origin: POS_ORIGIN } }))
        const allowedHeaders = (allowed as unknown as { headers: Record<string, string> }).headers
        expect(allowedHeaders["access-control-allow-origin"]).toEqual(POS_ORIGIN)

        const other = await fail(api.get("/pos/cashiers/me", { headers: { origin: "http://evil.example.test" } }))
        const otherHeaders = (other as unknown as { headers: Record<string, string> }).headers
        expect(otherHeaders["access-control-allow-origin"]).toBeUndefined()
      })
    })
  },
})
