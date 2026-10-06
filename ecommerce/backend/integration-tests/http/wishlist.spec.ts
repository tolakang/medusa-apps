import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createProductsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import { createShareToken } from "../../src/lib/wishlist-share"

// Wishlist + shared links (TASKS P1-19), through the real store routes,
// workflows and module. Customers sign in with a JWT signed with the test
// secret (Medusa's default "supersecret"), as in checkout-acceptance.spec.ts.
jest.setTimeout(180 * 1000)

const SECRET = "supersecret"

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Wishlist (TASKS P1-19)", () => {
      const setup = async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seedInitialData({ container })
        await seed({ container })
        const {
          data: [key],
        } = await query.graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        const store = { headers: { "x-publishable-api-key": key.token } }
        const { data } = await api.get("/store/products?fields=id,variants.id", store)
        const variants = data.products.flatMap((p) => p.variants.map((v) => v.id)) as string[]

        const customerService = container.resolve(Modules.CUSTOMER)
        const authService = container.resolve(Modules.AUTH)
        const signIn = async (email: string) => {
          const customer = await customerService.createCustomers({ email })
          const identity = await authService.createAuthIdentities({
            provider_identities: [{ provider: "emailpass", entity_id: email }],
            app_metadata: { customer_id: customer.id },
          })
          const token = jwt.sign(
            { actor_id: customer.id, actor_type: "customer", auth_identity_id: identity.id },
            SECRET,
            { expiresIn: "1d" }
          )
          return { headers: { ...store.headers, authorization: `Bearer ${token}` } }
        }
        return { container, store, variants, signIn }
      }
      // The error response of a refused request.
      const fail = (p: Promise<unknown>): Promise<{ status: number }> =>
        p.then(() => ({ status: 200 })).catch((e) => e.response)

      it("adds each variant once, shows the product, and removes it", async () => {
        const { variants, signIn } = await setup()
        const me = await signIn("wish@example.com")

        expect((await api.get("/store/customers/me/wishlists", me)).data.wishlist).toBeNull()

        await api.post("/store/customers/me/wishlists/items", { variant_id: variants[0] }, me)
        const { data } = await api.post("/store/customers/me/wishlists/items", { variant_id: variants[0] }, me)
        expect(data.wishlist.items).toHaveLength(1)
        const item = data.wishlist.items[0]
        expect(item.product_variant_id).toEqual(variants[0])
        expect(item.product_variant.product.handle).toBeTruthy()

        await api.post("/store/customers/me/wishlists/items", { variant_id: variants[1] }, me)
        const removed = await api.delete(`/store/customers/me/wishlists/items/${item.id}`, me)
        expect(removed.data.wishlist.items.map((i) => i.product_variant_id)).toEqual([variants[1]])

        // Added again after removal.
        const again = await api.post("/store/customers/me/wishlists/items", { variant_id: variants[0] }, me)
        expect(again.data.wishlist.items).toHaveLength(2)
      })

      it("refuses guests, unknown variants, other channels' products and other customers' items", async () => {
        const { container, store, variants, signIn } = await setup()
        const me = await signIn("owner@example.com")
        const other = await signIn("other@example.com")

        expect((await fail(api.get("/store/customers/me/wishlists", store))).status).toEqual(401)
        expect((await fail(api.post("/store/customers/me/wishlists/items", {}, me))).status).toEqual(400)
        expect(
          (await fail(api.post("/store/customers/me/wishlists/items", { variant_id: "variant_missing" }, me))).status
        ).toEqual(404)

        // A product in no sales channel can't be saved.
        const { result } = await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: "Hidden product",
                options: [{ title: "Size", values: ["One"] }],
                variants: [{ title: "One", options: { Size: "One" }, prices: [] }],
              },
            ],
          },
        })
        const hidden = result[0].variants[0].id
        expect((await fail(api.post("/store/customers/me/wishlists/items", { variant_id: hidden }, me))).status).toEqual(400)

        const { data } = await api.post("/store/customers/me/wishlists/items", { variant_id: variants[0] }, me)
        const itemId = data.wishlist.items[0].id
        expect((await fail(api.delete(`/store/customers/me/wishlists/items/${itemId}`, other))).status).toEqual(404)
        expect((await api.get("/store/customers/me/wishlists", me)).data.wishlist.items).toHaveLength(1)
      })

      it("shares a wishlist for 30 days through a signed link that can't be forged", async () => {
        const { store, variants, signIn } = await setup()
        const me = await signIn("share@example.com")
        expect((await fail(api.post("/store/customers/me/wishlists/share", {}, me))).status).toEqual(404)

        const { data: saved } = await api.post("/store/customers/me/wishlists/items", { variant_id: variants[0] }, me)
        const { data: share } = await api.post("/store/customers/me/wishlists/share", {}, me)
        const days = (new Date(share.expires_at).getTime() - Date.now()) / 86_400_000
        expect(days).toBeGreaterThan(29.9)
        expect(days).toBeLessThanOrEqual(30)

        // Anyone with the link (no sign-in) sees the products, not the owner.
        const { data: shared } = await api.get(`/store/wishlists/${share.token}`, store)
        expect(shared.wishlist.items.map((i) => i.product_variant_id)).toEqual([variants[0]])
        expect(JSON.stringify(shared)).not.toContain("customer")

        // Forged (another wishlist ID, same signature) and expired links are refused.
        const [, expires, signature] = share.token.split(".")
        const forged = `wishlist_other.${expires}.${signature}`
        expect((await fail(api.get(`/store/wishlists/${forged}`, store))).status).toEqual(404)
        const expired = createShareToken(saved.wishlist.id, SECRET, Date.now() - 31 * 86_400_000).token
        expect((await fail(api.get(`/store/wishlists/${expired}`, store))).status).toEqual(404)
      })
    })
  },
})
