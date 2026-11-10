import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import jwt from "jsonwebtoken"
import { PASSWORD_CHANGED_TEMPLATE } from "../../src/lib/auth-email"
import { WRONG_CURRENT_PASSWORD } from "../../src/workflows/change-password"

// Change password while signed in (owner, 2026-10-06): POST
// /store/customers/me/password with the current and the new password.
process.env.STOREFRONT_URL = "https://shop.example.com"
jest.setTimeout(120 * 1000)

const EMAIL = "member@example.com"
const OLD = "first-Password-1"
const NEW = "second-Password-2"

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Change password (account settings)", () => {
      // A registered customer, signed in as the storefront would be after
      // verification: the customer is linked to the emailpass identity.
      const setup = async () => {
        const container = getContainer()
        await api.post("/auth/customer/emailpass/register", { email: EMAIL, password: OLD })
        const auth = container.resolve(Modules.AUTH)
        const [login] = await auth.listProviderIdentities({ entity_id: EMAIL, provider: "emailpass" })
        const customer = await container.resolve(Modules.CUSTOMER).createCustomers({ email: EMAIL })
        await auth.updateAuthIdentities({
          id: login.auth_identity_id!,
          app_metadata: { customer_id: customer.id },
        })
        const key = await container.resolve(Modules.API_KEY).createApiKeys({
          title: "Store",
          type: "publishable",
          created_by: "test",
        })
        const store = { "x-publishable-api-key": key.token }
        const token = jwt.sign(
          { actor_id: customer.id, actor_type: "customer", auth_identity_id: login.auth_identity_id },
          "supersecret",
          { expiresIn: "1d" }
        )
        return { store, member: { headers: { ...store, authorization: `Bearer ${token}` } } }
      }
      const change = (body: object, config: object) =>
        api
          .post("/store/customers/me/password", body, config)
          .then((r) => ({ status: r.status, data: r.data }))
          .catch((e) => ({ status: e.response.status, data: e.response.data }))
      // Checks the password directly with the Auth Module (sign-in itself also
      // asks for email verification, which this test doesn't go through).
      const works = async (password: string) =>
        (await getContainer().resolve(Modules.AUTH).authenticate("emailpass", { body: { email: EMAIL, password } }))
          .success

      it("changes the password only with the right current password", async () => {
        const { store, member } = await setup()

        expect((await change({ current_password: OLD, new_password: NEW }, { headers: store })).status).toEqual(401)
        expect((await change({ current_password: OLD, new_password: "short" }, member)).status).toEqual(400)

        const wrong = await change({ current_password: "not-my-password", new_password: NEW }, member)
        expect(wrong.status).toEqual(400)
        expect(wrong.data.message).toEqual(WRONG_CURRENT_PASSWORD)
        expect(await works(OLD)).toBe(true)

        expect((await change({ current_password: OLD, new_password: NEW }, member)).status).toEqual(200)
        expect(await works(NEW)).toBe(true)
        expect(await works(OLD)).toBe(false)
      })

      it("emails the owner that the password was changed", async () => {
        const { member } = await setup()
        await change({ current_password: OLD, new_password: NEW }, member)
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        let sent: { data?: { url?: string } } | undefined
        for (let i = 0; i < 40 && !sent; i++) {
          const { data } = await query.graph({
            entity: "notification",
            fields: ["data"],
            filters: { to: EMAIL, template: PASSWORD_CHANGED_TEMPLATE },
          })
          sent = data[0] as unknown as typeof sent
          if (!sent) await new Promise((r) => setTimeout(r, 250))
        }
        expect(sent?.data?.url).toEqual("https://shop.example.com/forgot-password")
      })
    })
  },
})
