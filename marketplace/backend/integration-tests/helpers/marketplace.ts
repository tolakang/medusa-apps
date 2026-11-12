import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import { confirmVendorEmail } from "./vendor-email"

// Shared setup for marketplace HTTP tests (TASKS P6-06 onwards): the
// Cambodia shop as on staging, admin sign-in, vendor sign-up, and carts ready
// to complete through Medusa's system payment provider.
type Api = {
  get: (url: string, config?: any) => Promise<any>
  post: (url: string, body?: any, config?: any) => Promise<any>
}
type Headers = { headers: Record<string, string> }

export const IP_SECRET = "test-ip-secret"

export function marketplaceTestKit(api: Api, getContainer: () => MedusaContainer) {
  let ip = 0
  const freshIp = () => ({
    "x-shopper-ip-secret": IP_SECRET,
    "x-shopper-ip": `10.2.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`,
  })
  const bearer = (token?: string): Headers => ({
    headers: { ...freshIp(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
  })
  const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)

  // The shop as staging has it: first-boot defaults, demo catalog, Cambodia.
  const setupShop = async () => {
    const container = getContainer()
    await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    })
    await createDefaultsWorkflow(container).run()
    await seedInitialData({ container })
    await seed({ container })
    const {
      data: [key],
    } = await query().graph({
      entity: "api_key",
      fields: ["token"],
      filters: { type: "publishable" },
    })
    const {
      data: [region],
    } = await query().graph({ entity: "region", fields: ["id"], filters: { name: "Cambodia" } })
    return {
      store: { headers: { "x-publishable-api-key": key.token } } as Headers,
      regionId: region.id as string,
    }
  }

  const adminAuth = async (email = "admin@marketplace.test") => {
    const container = getContainer()
    const user = await container.resolve(Modules.USER).createUsers({ email })
    await container.resolve(Modules.AUTH).createAuthIdentities({
      provider_identities: [{ provider: "emailpass", entity_id: email }],
      app_metadata: { user_id: user.id },
    })
    await container
      .resolve(Modules.AUTH)
      .updateProvider("emailpass", { entity_id: email, password: "supersecret1" })
    const { data } = await api.post("/auth/user/emailpass", { email, password: "supersecret1" })
    return bearer(data.token)
  }

  // A vendor signed up through the API, approved by the admin, signed in.
  const signUpVendor = async (admin: Headers, email: string, name: string) => {
    const password = "vendor-pass-1"
    const reg = await api.post(
      "/auth/vendor/emailpass/register",
      { email, password },
      { headers: freshIp() }
    )
    const created = await api.post("/vendors", { name }, bearer(reg.data.token))
    await confirmVendorEmail(getContainer(), email)
    await api.post(`/admin/vendors/${created.data.vendor.id}`, { status: "active" }, admin)
    const login = await api.post("/auth/vendor/emailpass", { email, password }, { headers: freshIp() })
    return { id: created.data.vendor.id as string, auth: bearer(login.data.token) }
  }

  // Gives the products with these handles to the vendor.
  const giveProducts = async (vendorId: string, handles: string[]) => {
    const { data: products } = await query().graph({
      entity: "product",
      fields: ["id"],
      filters: { handle: handles },
    })
    for (const p of products) {
      await getContainer()
        .resolve(ContainerRegistrationKeys.LINK)
        .create({
          [MARKETPLACE_MODULE]: { vendor_id: vendorId },
          [Modules.PRODUCT]: { product_id: p.id },
        })
    }
  }

  const variantOf = async (handle: string) => {
    const { data } = await query().graph({
      entity: "product",
      fields: ["variants.id"],
      filters: { handle },
    })
    return data[0].variants![0]!.id as string
  }

  // A cart ready to complete: items, Cambodian address, delivery, payment.
  const readyCart = async (
    shop: { store: Headers; regionId: string },
    lines: { handle: string; quantity: number }[]
  ) => {
    const { store, regionId } = shop
    const {
      data: { cart },
    } = await api.post("/store/carts", { region_id: regionId }, store)
    for (const line of lines) {
      await api.post(
        `/store/carts/${cart.id}/line-items`,
        { variant_id: await variantOf(line.handle), quantity: line.quantity },
        store
      )
    }
    const address = {
      first_name: "Test",
      last_name: "Customer",
      address_1: "#111, St 310",
      province: "Phnom Penh",
      city: "Khan Chamkar Mon",
      postal_code: "120100",
      country_code: "kh",
      phone: "012 345 678",
    }
    await api.post(
      `/store/carts/${cart.id}`,
      { shipping_address: address, billing_address: address, email: "buyer@test.test" },
      store
    )
    const {
      data: { shipping_options },
    } = await api.get(`/store/shipping-options?cart_id=${cart.id}`, store)
    const delivery = shipping_options.find((o: { name: string }) => o.name === "Phnom Penh Delivery")
    await api.post(`/store/carts/${cart.id}/shipping-methods`, { option_id: delivery.id }, store)
    const {
      data: { payment_collection },
    } = await api.post("/store/payment-collections", { cart_id: cart.id }, store)
    await api.post(
      `/store/payment-collections/${payment_collection.id}/payment-sessions`,
      { provider_id: "pp_system_default" },
      store
    )
    return cart.id as string
  }

  return { freshIp, bearer, query, setupShop, adminAuth, signUpVendor, giveProducts, variantOf, readyCart }
}
