import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import jwt from "jsonwebtoken"
import { CAPTCHA_FAILED_MESSAGE } from "../../src/api/auth-guards"
import { TURNSTILE_SITEVERIFY_URL } from "../../src/lib/captcha"

// CAPTCHA on customer sign-in, sign-up and forgot password (TASKS P1-21),
// through Medusa's real auth routes. Cloudflare's Siteverify is faked: the
// token "good-token" passes, anything else fails. The env is set only while
// this file runs (all HTTP suites share one process).
jest.setTimeout(120 * 1000)

const realFetch = global.fetch
const siteverifyCalls: string[] = []

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    beforeAll(() => {
      process.env.CAPTCHA_PROVIDER = "turnstile"
      process.env.CAPTCHA_SECRET_KEY = "test-secret"
      process.env.STOREFRONT_URL = "https://shop.example.com"
      global.fetch = (async (input: any, init?: any) => {
        if (String(input) !== TURNSTILE_SITEVERIFY_URL) return realFetch(input, init)
        const token = new URLSearchParams(String(init?.body)).get("response") ?? ""
        siteverifyCalls.push(token)
        return new Response(JSON.stringify({ success: token === "good-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }) as typeof fetch
    })
    afterAll(() => {
      delete process.env.CAPTCHA_PROVIDER
      delete process.env.CAPTCHA_SECRET_KEY
      global.fetch = realFetch
    })

    describe("CAPTCHA (TASKS P1-21)", () => {
      const post = (path: string, body: object, headers: Record<string, string> = {}) =>
        api
          .post(path, body, { headers })
          .then((r) => ({ status: r.status, data: r.data }))
          .catch((e) => ({ status: e.response.status, data: e.response.data }))
      const refused = (r: { status: number; data: { message?: string } }) =>
        r.status === 400 && r.data.message === CAPTCHA_FAILED_MESSAGE

      it("guards customer sign-up, sign-in and forgot password", async () => {
        const account = { email: "guarded@example.com", password: "Local-Test-Pass-1" }

        expect(refused(await post("/auth/customer/emailpass/register", account))).toBe(true)
        expect(refused(await post("/auth/customer/emailpass/register", { ...account, captcha_token: "bad" }))).toBe(true)
        const signedUp = await post("/auth/customer/emailpass/register", { ...account, captcha_token: "good-token" })
        expect(signedUp.status).toEqual(200)

        expect(refused(await post("/auth/customer/emailpass", account))).toBe(true)
        const signedIn = await post("/auth/customer/emailpass", { ...account, captcha_token: "good-token" })
        expect(signedIn.status).toEqual(200)
        expect(signedIn.data.verification_required).toBe(true)

        expect(refused(await post("/auth/customer/emailpass/reset-password", { identifier: account.email }))).toBe(true)
        const reset = await post(
          "/auth/customer/emailpass/reset-password",
          { identifier: account.email },
          { "x-captcha-token": "good-token" }
        )
        expect(reset.status).toEqual(201)
      })

      it("leaves admin sign-in alone", async () => {
        const admin = await post("/auth/user/emailpass", { email: "nobody@example.com", password: "whatever-1" })
        expect(admin.status).toEqual(401)
        expect(refused(admin)).toBe(false)
      })

      it("lets a signed-in customer get a reset link without CAPTCHA", async () => {
        const container = getContainer()
        const email = "member@example.com"
        await post("/auth/customer/emailpass/register", { email, password: "Local-Test-Pass-1", captcha_token: "good-token" })
        const auth = container.resolve(Modules.AUTH)
        const [login] = await auth.listProviderIdentities({ entity_id: email, provider: "emailpass" })
        const customer = await container.resolve(Modules.CUSTOMER).createCustomers({ email })
        await auth.updateAuthIdentities({ id: login.auth_identity_id!, app_metadata: { customer_id: customer.id } })
        const key = await container.resolve(Modules.API_KEY).createApiKeys({
          title: "Store",
          type: "publishable",
          created_by: "test",
        })
        const token = jwt.sign(
          { actor_id: customer.id, actor_type: "customer", auth_identity_id: login.auth_identity_id },
          "supersecret",
          { expiresIn: "1d" }
        )
        const sent = await post(
          "/store/customers/me/password-reset",
          {},
          { "x-publishable-api-key": key.token, authorization: `Bearer ${token}` }
        )
        // No captcha_token was sent: the signed-in route doesn't need one.
        expect(sent.status).toEqual(201)
      })
    })
  },
})
