import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { AUTH_LIMITS } from "../../src/api/auth-guards"
import { VERIFY_EMAIL_TEMPLATE } from "../../src/lib/auth-email"
import { cleanupUnverifiedAccountsWorkflow } from "../../src/workflows/cleanup-unverified-accounts"

// Per-IP limits on customer auth and the cleanup of never-verified sign-ups
// (TASKS P1-21). The client IP comes from a test header (CLIENT_IP_HEADER),
// set only while this file runs, so other suites keep their own counters.
// Read when the app starts (admin.storefrontUrl), so set before it boots.
process.env.STOREFRONT_URL = "https://shop.example.com"
jest.setTimeout(120 * 1000)
const PASSWORD = "Local-Test-Pass-1"

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    beforeAll(() => {
      process.env.CLIENT_IP_HEADER = "x-test-ip"
    })
    afterAll(() => {
      delete process.env.CLIENT_IP_HEADER
    })

    const post = (path: string, body: object, ip: string) =>
      api
        .post(path, body, { headers: { "x-test-ip": ip } })
        .then((r) => ({ status: r.status, headers: r.headers, data: r.data }))
        .catch((e) => ({ status: e.response.status, headers: e.response.headers, data: e.response.data }))

    describe("Per-IP limits (TASKS P1-21)", () => {
      it("refuses the next sign-in from an IP over its limit, and only that IP", async () => {
        const attempt = (ip: string) => post("/auth/customer/emailpass", { email: "x@example.com", password: "wrong-pass-1" }, ip)
        for (let i = 0; i < AUTH_LIMITS.login; i++) {
          expect((await attempt("203.0.113.7")).status).toEqual(401)
        }
        const blocked = await attempt("203.0.113.7")
        expect(blocked.status).toEqual(429)
        expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0)
        expect(blocked.data.message).toMatch(/^Too many attempts/)
        expect((await attempt("203.0.113.8")).status).toEqual(401)
      })
    })

    describe("Cleanup of never-verified sign-ups (TASKS P1-21)", () => {
      it("removes only old, unverified, unused email sign-ups", async () => {
        const container = getContainer()
        const auth = container.resolve(Modules.AUTH)
        const register = async (email: string, ip: string) => {
          await post("/auth/customer/emailpass/register", { email, password: PASSWORD }, ip)
          const [login] = await auth.listProviderIdentities({ entity_id: email, provider: "emailpass" })
          return login.auth_identity_id!
        }
        const abandoned = await register("abandoned@example.com", "198.51.100.1")
        const customer = await register("customer@example.com", "198.51.100.2")
        await auth.updateAuthIdentities({ id: customer, app_metadata: { customer_id: "cus_123" } })
        const admin = await register("admin@example.com", "198.51.100.3")
        await auth.updateAuthIdentities({ id: admin, app_metadata: { user_id: "user_123" } })

        // A sign-up that confirmed its email (the real verification flow).
        const verified = await register("verified@example.com", "198.51.100.4")
        const { data } = await post("/auth/customer/emailpass", { email: "verified@example.com", password: PASSWORD }, "198.51.100.4")
        await api.post(
          "/auth/verification/request",
          { entity_id: "verified@example.com", entity_type: "email" },
          { headers: { authorization: `Bearer ${data.token}`, "x-test-ip": "198.51.100.4" } }
        )
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        let url = ""
        for (let i = 0; i < 40 && !url; i++) {
          const { data: sent } = await query.graph({
            entity: "notification",
            fields: ["data"],
            filters: { to: "verified@example.com", template: VERIFY_EMAIL_TEMPLATE },
          })
          url = (sent[0]?.data as { url?: string } | undefined)?.url ?? ""
          if (!url) await new Promise((r) => setTimeout(r, 250))
        }
        await api.post("/auth/verification/confirm", { code: new URL(url).searchParams.get("token") })

        const exists = async (id: string) => (await auth.listAuthIdentities({ id: [id] })).length === 1

        // Cut-off in the past: everything is recent, nothing is removed.
        const none = await cleanupUnverifiedAccountsWorkflow(container).run({
          input: { before: new Date(Date.now() - 60_000).toISOString() },
        })
        expect(none.result.deleted).toEqual(0)
        expect(await exists(abandoned)).toBe(true)

        // Cut-off in the future: all are "old"; only the abandoned one goes.
        const run = await cleanupUnverifiedAccountsWorkflow(container).run({
          input: { before: new Date(Date.now() + 60_000).toISOString() },
        })
        expect(run.result.deleted).toEqual(1)
        expect(await exists(abandoned)).toBe(false)
        expect(await auth.listProviderIdentities({ entity_id: "abandoned@example.com" })).toHaveLength(0)
        for (const kept of [customer, admin, verified]) {
          expect(await exists(kept)).toBe(true)
        }
      })
    })
  },
})
