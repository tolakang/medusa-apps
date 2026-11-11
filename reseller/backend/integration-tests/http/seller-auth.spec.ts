import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import {
  NO_SELLER_INVITATION_MESSAGE,
  WRONG_SELLER_INVITE_CODE_MESSAGE,
} from "../../src/workflows/seller/accept-seller-invite"
import { SELLER_SUSPENDED_MESSAGE } from "../../src/api/seller-auth"
import { SELLER_MODULE } from "../../src/modules/seller"
import SellerModuleService from "../../src/modules/seller/service"

jest.setTimeout(120 * 1000)

const PORTAL = "https://portal.seller.test"

// TASKS P5-03 (plan §6.5): the `seller` actor type, invite-only like POS
// cashiers (MEDUSA_SKILL §7): the shop creates the seller, the seller
// registers with that email and accepts, then signs in; every /sellers
// route needs a signed-in seller who isn't suspended, behind SELLER_CORS.
medusaIntegrationTestRunner({
  env: { SELLER_CORS: PORTAL },
  testSuite: ({ api, getContainer }) => {
    describe("seller auth (TASKS P5-03)", () => {
      let admin: { headers: Record<string, string> }

      const call = (request: Promise<any>) =>
        request.then(
          (res) => res,
          (err) => err.response
        )
      const bearer = (token?: string): { headers: Record<string, string> } => ({
        headers: token ? { authorization: `Bearer ${token}` } : {},
      })

      beforeEach(async () => {
        const container = getContainer()
        const email = "admin@shop.test"
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

      const invite = (body: Record<string, unknown> = {}) =>
        call(
          api.post(
            "/admin/sellers",
            { handle: "sok-shop", name: "Sok Shop", email: "Sok@Seller.test", ...body },
            admin
          )
        )
      const register = async (email: string, password = "seller-pass-1") =>
        call(api.post("/auth/seller/emailpass/register", { email, password }))
      const login = async (email: string, password = "seller-pass-1") =>
        (await api.post("/auth/seller/emailpass", { email, password })).data.token as string

      // Invite, register, accept, sign in.
      const onboard = async (email = "sok@seller.test") => {
        const invited = await invite({ email })
        const registered = await register(email)
        const accepted = await call(
          api.post(
            "/sellers/accept",
            { invite_code: invited.data.invite_code },
            bearer(registered.data.token)
          )
        )
        return { invited, registered, accepted, token: await login(email) }
      }

      it("the shop invites a seller; bad or duplicate invitations are refused", async () => {
        const res = await invite()
        expect(res.status).toEqual(200)
        expect(res.data.seller).toEqual(
          expect.objectContaining({
            handle: "sok-shop",
            email: "sok@seller.test",
            status: "pending",
            sales_channel: expect.objectContaining({ name: "Seller: Sok Shop" }),
          })
        )
        expect(res.data.publishable_key).toMatch(/^pk_/)
        // The shop hands this code to the seller (REVIEW_FIXES B11).
        expect(res.data.invite_code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)

        // The same email in other case: one seller per email.
        expect((await invite({ handle: "other", email: "SOK@seller.test" })).status).toEqual(422)
        expect((await invite({ handle: "Bad Handle", email: "x@seller.test" })).status).toEqual(400)
        expect(
          (await invite({ handle: "x", email: "x@seller.test", commission_rate: 120 })).status
        ).toEqual(400)
        expect(
          (await invite({ handle: "x", email: "x@seller.test", is_admin: true })).status
        ).toEqual(400)

        const list = await api.get("/admin/sellers", admin)
        expect(list.data.count).toEqual(1)
      })

      it("an invited seller registers, accepts, signs in and reads /sellers/me", async () => {
        const { registered, accepted, token } = await onboard()
        expect(registered.status).toEqual(200)

        // Before accepting, the registration token reaches no other route.
        expect(
          (await call(api.get("/sellers/me", bearer(registered.data.token)))).status
        ).toEqual(401)

        expect(accepted.status).toEqual(200)
        expect(accepted.data.seller.email).toEqual("sok@seller.test")

        const me = await api.get("/sellers/me", bearer(token))
        expect(me.data.seller).toEqual(
          expect.objectContaining({
            handle: "sok-shop",
            sales_channel: expect.objectContaining({ id: expect.any(String) }),
          })
        )

        // Accepting twice is refused.
        expect(
          (
            await call(
              api.post("/sellers/accept", { invite_code: "AAAAA-AAAAA" }, bearer(token))
            )
          ).status
        ).toEqual(400)
      })

      it("nobody becomes a seller without an invitation", async () => {
        const registered = await register("stranger@seller.test")
        const accepted = await call(
          api.post(
            "/sellers/accept",
            { invite_code: "AAAAA-AAAAA" },
            bearer(registered.data.token)
          )
        )
        expect(accepted.status).toEqual(400)
        expect(accepted.data.message).toEqual(NO_SELLER_INVITATION_MESSAGE)
      })

      // REVIEW_FIXES B11: knowing the invited email isn't enough any more.
      it("the invited email without the shop's invite code can't take the seller account", async () => {
        const invited = await invite({ email: "target@seller.test", handle: "target" })
        const other = await invite({ email: "other@seller.test", handle: "other" })
        const registered = await register("target@seller.test")
        const accept = (body: Record<string, unknown>) =>
          call(api.post("/sellers/accept", body, bearer(registered.data.token)))

        expect((await accept({})).status).toEqual(400)
        for (const code of ["AAAAA-AAAAA", other.data.invite_code]) {
          const res = await accept({ invite_code: code })
          expect(res.status).toEqual(400)
          expect(res.data.message).toEqual(WRONG_SELLER_INVITE_CODE_MESSAGE)
        }
        expect(
          (await call(api.get("/sellers/me", bearer(await login("target@seller.test"))))).status
        ).toEqual(401)

        // The real code still works afterwards, typed in lower case.
        const ok = await accept({ invite_code: invited.data.invite_code.toLowerCase() })
        expect(ok.status).toEqual(200)
        expect(ok.data.seller.email).toEqual("target@seller.test")
        expect(
          (await api.get("/admin/sellers", admin)).data.sellers.find(
            (s: { handle: string }) => s.handle === "target"
          ).invite_code
        ).toEqual(invited.data.invite_code)
      })

      it("short passwords, guests, admins and customers are refused", async () => {
        await invite({ email: "short@seller.test", handle: "short" })
        expect((await register("short@seller.test", "short")).status).toEqual(400)

        expect((await call(api.get("/sellers/me"))).status).toEqual(401)
        expect((await call(api.get("/sellers/me", admin))).status).toEqual(401)

        const customer = await call(
          api.post("/auth/customer/emailpass/register", {
            email: "shopper@customer.test",
            password: "customer-pass-1",
          })
        )
        expect(customer.status).toEqual(200)
        expect(
          (await call(api.get("/sellers/me", bearer(customer.data.token)))).status
        ).toEqual(401)
      })

      it("a suspended seller is locked out at once and can't accept", async () => {
        const { token, invited } = await onboard()
        const sellers = getContainer().resolve<SellerModuleService>(SELLER_MODULE)
        await sellers.updateSellers({ id: invited.data.seller.id, status: "suspended" })

        const res = await call(api.get("/sellers/me", bearer(token)))
        expect(res.status).toEqual(401)
        expect(res.data.message).toEqual(SELLER_SUSPENDED_MESSAGE)

        const late = await invite({ email: "late@seller.test", handle: "late", status: "suspended" })
        const registered = await register("late@seller.test")
        const accepted = await call(
          api.post(
            "/sellers/accept",
            { invite_code: late.data.invite_code },
            bearer(registered.data.token)
          )
        )
        expect(accepted.status).toEqual(400)
      })

      it("CORS: the portal origin is allowed on /sellers, others aren't", async () => {
        const preflight = (origin: string) =>
          call(
            api.options("/sellers/me", {
              headers: {
                origin,
                "access-control-request-method": "GET",
                "access-control-request-headers": "authorization",
              },
            })
          )
        const ok = await preflight(PORTAL)
        expect(ok.headers["access-control-allow-origin"]).toEqual(PORTAL)
        const other = await preflight("https://evil.test")
        expect(other.headers["access-control-allow-origin"]).toBeUndefined()
      })
    })
  },
})
