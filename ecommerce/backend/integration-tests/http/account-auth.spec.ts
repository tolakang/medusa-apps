import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PASSWORD_RESET_TEMPLATE, VERIFY_EMAIL_TEMPLATE } from "../../src/lib/auth-email"

// Account emails (TASKS P1-18): customers verify their email before they can
// sign in, and reset a forgotten password through an emailed link. Real
// routes, subscribers and Notification Module (notification-local: no Resend
// key in tests); the links are read from the stored notifications.
process.env.STOREFRONT_URL = "https://shop.example.com"
process.env.ADMIN_CORS = "https://api.example.com"
jest.setTimeout(120 * 1000)

const PASSWORD = "first-Password-1"
const NEW_PASSWORD = "second-Password-2"

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Account emails (TASKS P1-18)", () => {
      // The link in the newest email of this template to this address.
      const emailLink = async (to: string, template: string) => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        for (let i = 0; i < 40; i++) {
          const { data } = await query.graph({
            entity: "notification",
            fields: ["to", "template", "data", "created_at"],
            filters: { to, template },
          })
          const latest = data.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
          const url = (latest?.data as { url?: string } | undefined)?.url
          if (url) return new URL(url)
          await new Promise((r) => setTimeout(r, 250))
        }
        return null
      }
      const count = async (to: string, template: string) => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "notification",
          fields: ["id"],
          filters: { to, template },
        })
        return data.length
      }
      const login = (email: string, password: string) =>
        api.post("/auth/customer/emailpass", { email, password }).catch((e) => e.response)

      // Register, then verify through the emailed link, as the storefront does.
      const verifiedCustomer = async (email: string) => {
        await api.post("/auth/customer/emailpass/register", { email, password: PASSWORD })
        const first = await login(email, PASSWORD)
        expect(first.data.verification_required).toBe(true)
        await api.post(
          "/auth/verification/request",
          { entity_id: email, entity_type: "email" },
          { headers: { authorization: `Bearer ${first.data.token}` } }
        )
        const link = await emailLink(email, VERIFY_EMAIL_TEMPLATE)
        expect(link?.origin + link!.pathname).toEqual("https://shop.example.com/verify-account")
        expect(link!.searchParams.get("email")).toEqual(email)
        await api.post("/auth/verification/confirm", { code: link!.searchParams.get("token") })
      }

      it("asks new customers to verify their email before they can sign in", async () => {
        const email = "verify@example.com"
        await api.post("/auth/customer/emailpass/register", { email, password: PASSWORD })

        const before = await login(email, PASSWORD)
        expect(before.status).toEqual(200)
        expect(before.data.verification_required).toBe(true)

        // A made-up code is refused.
        const forged = await api
          .post("/auth/verification/confirm", { code: "not-a-real-code" })
          .catch((e) => e.response)
        expect(forged.status).toBeGreaterThanOrEqual(400)

        await verifiedCustomer(email)
        const after = await login(email, PASSWORD)
        expect(after.status).toEqual(200)
        expect(after.data.verification_required).toBeFalsy()
        expect(typeof after.data.token).toEqual("string")
      })

      it("resets a forgotten password once, through the emailed link", async () => {
        const email = "reset@example.com"
        await verifiedCustomer(email)

        const request = await api.post("/auth/customer/emailpass/reset-password", { identifier: email })
        expect(request.status).toBeLessThan(300)
        const link = await emailLink(email, PASSWORD_RESET_TEMPLATE)
        expect(link?.origin + link!.pathname).toEqual("https://shop.example.com/reset-password")
        const token = link!.searchParams.get("token")!

        const update = () =>
          api
            .post(
              "/auth/customer/emailpass/update",
              { email, password: NEW_PASSWORD },
              { headers: { authorization: `Bearer ${token}` } }
            )
            .catch((e) => e.response)
        expect((await update()).status).toEqual(200)

        expect((await login(email, PASSWORD)).status).toEqual(401)
        expect(typeof (await login(email, NEW_PASSWORD)).data.token).toEqual("string")
        // The token works only once.
        expect((await update()).status).toBeGreaterThanOrEqual(400)
      })

      it("answers the same for an unknown email and sends nothing", async () => {
        const email = "nobody@example.com"
        const request = await api.post("/auth/customer/emailpass/reset-password", { identifier: email })
        expect(request.status).toBeLessThan(300)
        await new Promise((r) => setTimeout(r, 1500))
        expect(await count(email, PASSWORD_RESET_TEMPLATE)).toEqual(0)
      })

      it("sends admin users to the admin dashboard's reset page", async () => {
        const email = "staff@example.com"
        await api.post("/auth/user/emailpass/register", { email, password: PASSWORD })
        await api.post("/auth/user/emailpass/reset-password", { identifier: email })
        const link = await emailLink(email, PASSWORD_RESET_TEMPLATE)
        expect(link?.origin + link!.pathname).toEqual("https://api.example.com/app/reset-password")
      })
    })
  },
})
