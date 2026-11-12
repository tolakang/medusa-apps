import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import {
  VENDOR_PENDING_MESSAGE,
  VENDOR_SUSPENDED_MESSAGE,
} from "../../src/api/vendor-auth"
import {
  VENDOR_EMAIL_TAKEN_MESSAGE,
  VENDOR_HANDLE_TAKEN_MESSAGE,
} from "../../src/workflows/marketplace/create-vendor"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import type MarketplaceModuleService from "../../src/modules/marketplace/service"

jest.setTimeout(120 * 1000)

const PORTAL = "https://vendors.marketplace.test"

// TASKS P6-03 (plan §6.6): the `vendor` actor type as in the official Vendors
// example: register, POST /vendors with the registration token, sign in;
// the vendor waits for the admin's approval; every /vendors route needs a
// signed-in vendor admin of an active vendor, behind VENDOR_CORS.
medusaIntegrationTestRunner({
  // A fresh client IP per request (auth-guards.ts SHOPPER_IP_* headers), so
  // the per-IP sign-up limit (10 a minute) doesn't trip across tests.
  env: { VENDOR_CORS: PORTAL, SHOPPER_IP_SECRET: "test-ip-secret" },
  testSuite: ({ api, getContainer }) => {
    describe("vendor auth (TASKS P6-03)", () => {
      let admin: { headers: Record<string, string> }

      const call = (request: Promise<any>) =>
        request.then(
          (res) => res,
          (err) => err.response
        )
      let ip = 0
      const freshIp = () => ({
        "x-shopper-ip-secret": "test-ip-secret",
        "x-shopper-ip": `10.0.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`,
      })
      const bearer = (token?: string): { headers: Record<string, string> } => ({
        headers: { ...freshIp(), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      })
      const marketplace = () =>
        getContainer().resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

      beforeEach(async () => {
        const container = getContainer()
        const email = "admin@marketplace.test"
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

      const register = (email: string, password = "vendor-pass-1") =>
        call(
          api.post("/auth/vendor/emailpass/register", { email, password }, { headers: freshIp() })
        )
      const login = async (email: string, password = "vendor-pass-1") =>
        (await api.post("/auth/vendor/emailpass", { email, password }, { headers: freshIp() }))
          .data.token as string
      const signUp = async (
        email = "Dara@Crafts.test",
        body: Record<string, unknown> = { name: "Dara Crafts" }
      ) => {
        const registered = await register(email)
        const created = await call(
          api.post("/vendors", body, bearer(registered.data.token))
        )
        return { registered, created }
      }
      const approve = (vendorId: string, status = "active") =>
        call(api.post(`/admin/vendors/${vendorId}`, { status }, admin))

      it("signs up a pending vendor with its first admin", async () => {
        const { created } = await signUp("Dara@Crafts.test", {
          name: "Dara's Crafts",
          admin: { first_name: "Dara", last_name: "Sok" },
        })
        expect(created.status).toBe(201)
        expect(created.data.vendor).toEqual(
          expect.objectContaining({
            handle: "dara-s-crafts",
            name: "Dara's Crafts",
            // The sign-in email, lowercased, unless the shop gives another.
            email: "dara@crafts.test",
            status: "pending",
            commission_rate: null,
          })
        )
        expect(created.data.vendor_admin).toEqual(
          expect.objectContaining({
            email: "dara@crafts.test",
            first_name: "Dara",
            last_name: "Sok",
          })
        )

        // The auth identity now points at the vendor admin. Emailpass matches
        // the email exactly as registered (case included).
        expect((await call(api.post("/auth/vendor/emailpass", { email: "dara@crafts.test", password: "vendor-pass-1" }, { headers: freshIp() }))).status).toBe(401)
        const token = await login("Dara@Crafts.test")
        const me = await call(api.get("/vendors/me", bearer(token)))
        expect(me.status).toBe(200)
        expect(me.data.vendor_admin.id).toEqual(created.data.vendor_admin.id)
        expect(me.data.vendor.status).toBe("pending")
      })

      it("the admin's email comes from the registration, not the body", async () => {
        const registered = await register("real@vendor.test")
        const res = await call(
          api.post(
            "/vendors",
            { name: "Fake", admin: { email: "someone-else@vendor.test" } },
            bearer(registered.data.token)
          )
        )
        expect(res.status).toBe(400)
        const ok = await call(
          api.post(
            "/vendors",
            { name: "Real", email: "shop@real.test" },
            bearer(registered.data.token)
          )
        )
        expect(ok.status).toBe(201)
        expect(ok.data.vendor_admin.email).toBe("real@vendor.test")
        expect(ok.data.vendor.email).toBe("shop@real.test")
      })

      it("refuses a bad body, a taken handle and a second sign-up", async () => {
        const first = await signUp("one@vendor.test", { name: "Shop", handle: "shop" })
        expect(first.created.status).toBe(201)

        const reg = await register("two@vendor.test")
        const two = bearer(reg.data.token)
        expect((await call(api.post("/vendors", {}, two))).status).toBe(400)
        expect(
          (await call(api.post("/vendors", { name: "X", handle: "Bad Handle" }, two))).status
        ).toBe(400)
        expect(
          (await call(api.post("/vendors", { name: "X", status: "active" }, two))).status
        ).toBe(400)
        expect((await call(api.post("/vendors", { name: "!!!" }, two))).status).toBe(400)

        const taken = await call(api.post("/vendors", { name: "Shop", handle: "shop" }, two))
        expect(taken.status).toBe(422)
        expect(taken.data.message).toBe(VENDOR_HANDLE_TAKEN_MESSAGE)
        // Nothing was left behind by the failed sign-up.
        expect(await marketplace().listVendorAdmins({ email: "two@vendor.test" })).toEqual([])

        // The same registration token can't make a second vendor.
        const again = await call(
          api.post("/vendors", { name: "Again" }, bearer(first.registered.data.token))
        )
        expect(again.status).toBeGreaterThanOrEqual(400)
        expect(await marketplace().listVendors({ name: "Again" })).toEqual([])
      })

      it("refuses an email that already has a vendor admin", async () => {
        await signUp("dup@vendor.test", { name: "First" })
        // Someone else's identity with that email can't exist (emailpass), so
        // simulate a stale vendor admin row with the same email.
        const reg = await register("other@vendor.test")
        const [existing] = await marketplace().listVendorAdmins({ email: "dup@vendor.test" })
        await marketplace().updateVendorAdmins({ id: existing.id, email: "other@vendor.test" })
        const res = await call(api.post("/vendors", { name: "Second" }, bearer(reg.data.token)))
        expect(res.status).toBe(422)
        expect(res.data.message).toBe(VENDOR_EMAIL_TAKEN_MESSAGE)
      })

      it("a pending vendor may only read /vendors/me until approved", async () => {
        const { created } = await signUp()
        const token = await login("Dara@Crafts.test")

        const blocked = await call(api.get("/vendors/me/anything", bearer(token)))
        expect(blocked.status).toBe(403)
        expect(blocked.data.message).toBe(VENDOR_PENDING_MESSAGE)

        expect((await approve(created.data.vendor.id)).status).toBe(200)
        const me = await call(api.get("/vendors/me", bearer(token)))
        expect(me.data.vendor.status).toBe("active")
        // Past the vendor check (no such route → 404, not 401/403).
        expect((await call(api.get("/vendors/me/anything", bearer(token)))).status).toBe(404)
      })

      it("a suspended vendor's token stops working at once", async () => {
        const { created } = await signUp()
        const token = await login("Dara@Crafts.test")
        await approve(created.data.vendor.id)
        expect((await call(api.get("/vendors/me", bearer(token)))).status).toBe(200)

        await approve(created.data.vendor.id, "suspended")
        const res = await call(api.get("/vendors/me", bearer(token)))
        expect(res.status).toBe(401)
        expect(res.data.message).toBe(VENDOR_SUSPENDED_MESSAGE)
      })

      it("other actors and anonymous callers are refused", async () => {
        expect((await call(api.get("/vendors/me"))).status).toBe(401)
        expect((await call(api.get("/vendors/me", admin))).status).toBe(401)
        // A registration token without a vendor may only sign up.
        const reg = await register("new@vendor.test")
        expect((await call(api.get("/vendors/me", bearer(reg.data.token)))).status).toBe(401)
      })

      it("the admin lists the approval queue and sets the commission", async () => {
        const one = await signUp("one@vendor.test", { name: "One" })
        await signUp("two@vendor.test", { name: "Two" })
        await approve(one.created.data.vendor.id)

        const queue = await call(api.get("/admin/vendors?status=pending", admin))
        expect(queue.status).toBe(200)
        expect(queue.data.vendors.map((v: { name: string }) => v.name)).toEqual(["Two"])
        expect(queue.data.vendors[0].admins[0].email).toBe("two@vendor.test")

        const all = await call(api.get("/admin/vendors", admin))
        expect(all.data.count).toBe(2)
        expect((await call(api.get("/admin/vendors?status=open", admin))).status).toBe(400)

        const rate = await call(
          api.post(`/admin/vendors/${one.created.data.vendor.id}`, { commission_rate: 15 }, admin)
        )
        expect(rate.data.vendor.commission_rate).toBe(15)
        expect(
          (
            await call(
              api.post(`/admin/vendors/${one.created.data.vendor.id}`, { commission_rate: 101 }, admin)
            )
          ).status
        ).toBe(400)
        expect(
          (await call(api.post(`/admin/vendors/${one.created.data.vendor.id}`, {}, admin))).status
        ).toBe(400)
        expect((await call(api.get("/admin/vendors/ven_missing", admin))).status).toBe(404)

        // Vendors can't use the admin routes.
        const token = await login("one@vendor.test")
        expect((await call(api.get("/admin/vendors", bearer(token)))).status).toBe(401)
      })

      it("answers CORS for the vendor portal only", async () => {
        const allowed = await call(
          api.options("/vendors/me", {
            headers: { origin: PORTAL, "access-control-request-method": "GET" },
          })
        )
        expect(allowed.headers["access-control-allow-origin"]).toBe(PORTAL)
        const other = await call(
          api.options("/vendors/me", {
            headers: {
              origin: "https://evil.test",
              "access-control-request-method": "GET",
            },
          })
        )
        expect(other.headers["access-control-allow-origin"]).toBeUndefined()
      })
    })
  },
})
