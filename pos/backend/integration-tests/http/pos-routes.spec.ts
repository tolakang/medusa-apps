import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"
import seedInitialData from "../../src/scripts/seed-initial-data"
import seed from "../../src/scripts/seed"

// TASKS P2-06: the POS routes end to end, as the POS app (P2-10) and the
// admin will call them. Data as on staging (demo products + Cambodia seed);
// the cashier goes through the real invite flow (P2-03).
jest.setTimeout(300 * 1000)

const SECRET = "supersecret"
const PASSWORD = "cashier-pass-123"

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("POS routes (TASKS P2-06)", () => {
      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } })
      const fail = (p: Promise<unknown>): Promise<{ status: number; data?: { message?: string } }> =>
        p.then(() => ({ status: 200 })).catch((e) => e.response)

      const setup = async () => {
        const container = getContainer()
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seedInitialData({ container })
        await seed({ container })

        const user = await container.resolve(Modules.USER).createUsers({ email: "admin@example.com" })
        const identity = await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: user.email }],
          app_metadata: { user_id: user.id },
        })
        const admin = bearer(
          jwt.sign({ actor_id: user.id, actor_type: "user", auth_identity_id: identity.id }, SECRET, { expiresIn: "1d" })
        )

        const { data: invited } = await api.post("/admin/pos/cashiers", { name: "Sokha", email: "sokha@example.com" }, admin)
        const { data: reg } = await api.post("/auth/cashier/emailpass/register", { email: "sokha@example.com", password: PASSWORD })
        await api.post("/pos/cashiers/accept", {}, bearer(reg.token))
        const { data: login } = await api.post("/auth/cashier/emailpass", { email: "sokha@example.com", password: PASSWORD })
        const cashier = bearer(login.token)

        const [store] = await container.resolve(Modules.STORE).listStores({})
        const [location] = await container.resolve(Modules.STOCK_LOCATION).listStockLocations({ name: "Phnom Penh" })
        return { container, admin, cashier, cashierId: invited.cashier.id as string, store, location }
      }

      it("admin sets up a register; a cashier opens a shift, scans, sells, closes; the report shows it", async () => {
        const { container, admin, cashier, cashierId, store, location } = await setup()

        // Register setup.
        const { data: created } = await api.post(
          "/admin/pos/registers",
          { name: "Front till", code: "PP-1", stock_location_id: location.id, sales_channel_id: store.default_sales_channel_id },
          admin
        )
        const register = created.register
        expect(register).toEqual(
          expect.objectContaining({
            name: "Front till",
            code: "PP-1",
            is_active: true,
            stock_location: expect.objectContaining({ id: location.id }),
            sales_channel: expect.objectContaining({ id: store.default_sales_channel_id }),
          })
        )
        const again = await fail(
          api.post(
            "/admin/pos/registers",
            { name: "Copy", code: "PP-1", stock_location_id: location.id, sales_channel_id: store.default_sales_channel_id },
            admin
          )
        )
        expect(again.status).toEqual(422)
        expect(
          (
            await fail(
              api.post(
                "/admin/pos/registers",
                { name: "X", code: "PP-2", stock_location_id: "sloc_missing", sales_channel_id: store.default_sales_channel_id },
                admin
              )
            )
          ).status
        ).toEqual(404)

        // Moving the register to another channel replaces the link.
        const [other] = await container.resolve(Modules.SALES_CHANNEL).createSalesChannels([{ name: "Other shop" }])
        await api.post(`/admin/pos/registers/${register.id}`, { sales_channel_id: other.id }, admin)
        const { data: moved } = await api.post(
          `/admin/pos/registers/${register.id}`,
          { name: "Till 1", sales_channel_id: store.default_sales_channel_id },
          admin
        )
        expect(moved.register.name).toEqual("Till 1")
        expect(moved.register.sales_channel.id).toEqual(store.default_sales_channel_id)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data: channels } = await query.graph({
          entity: "sales_channel",
          fields: ["id", "pos_registers.id"],
          filters: { id: [other.id, store.default_sales_channel_id!] },
        })
        const registersOf = (id: string) =>
          (channels.find((c) => c.id === id)?.pos_registers ?? []).map((r) => r?.id)
        expect(registersOf(other.id)).toEqual([])
        expect(registersOf(store.default_sales_channel_id!)).toEqual([register.id])

        // The cashier picks the register and opens a shift.
        const { data: list } = await api.get("/pos/registers", cashier)
        expect(list.registers).toEqual([expect.objectContaining({ id: register.id, open_shift: null })])
        const { data: opened } = await api.post("/pos/shifts/open", { register_id: register.id, opening_cash: 20 }, cashier)
        const shift = opened.shift
        expect(shift).toEqual(expect.objectContaining({ status: "open", opened_by: cashierId, currency_code: "usd" }))
        const { data: listOpen } = await api.get("/pos/registers", cashier)
        expect(listOpen.registers[0].open_shift.id).toEqual(shift.id)

        // Scan: by SKU and by barcode, priced in USD.
        const { data: bySku } = await api.get(`/pos/products/lookup?code=SHIRT-L-BLACK&shift_id=${shift.id}`, cashier)
        const variant = bySku.variants[0]
        expect(variant).toEqual(
          expect.objectContaining({ sku: "SHIRT-L-BLACK", currency_code: "usd", product: expect.objectContaining({ title: "Medusa T-Shirt" }) })
        )
        expect(variant.price).toBeGreaterThan(0)
        await container.resolve(Modules.PRODUCT).updateProductVariants(variant.id, { barcode: "8850000000017" })
        const { data: byBarcode } = await api.get(`/pos/products/lookup?code=8850000000017&shift_id=${shift.id}`, cashier)
        expect(byBarcode.variants.map((v) => v.id)).toEqual([variant.id])
        expect((await fail(api.get(`/pos/products/lookup?code=NOPE&shift_id=${shift.id}`, cashier))).status).toEqual(404)
        expect((await fail(api.get("/pos/products/lookup?code=SHIRT-L-BLACK", cashier))).status).toEqual(400)

        // Customer: create a walk-in, find them by phone.
        const { data: newCustomer } = await api.post(
          "/pos/customers",
          { first_name: "Dara", last_name: "Chan", phone: "012 345 678" },
          cashier
        )
        expect(newCustomer.customer).toEqual(expect.objectContaining({ first_name: "Dara", phone: "012 345 678" }))
        const { data: found } = await api.get("/pos/customers?q=345", cashier)
        expect(found.customers.map((c) => c.id)).toContain(newCustomer.customer.id)
        expect((await fail(api.post("/pos/customers", { first_name: "No contact" }, cashier))).status).toEqual(400)
        expect((await fail(api.post("/pos/customers", { first_name: "Bad", phone: "call me" }, cashier))).status).toEqual(400)

        // Sell 2 for cash to that customer.
        expect(
          (
            await fail(
              api.post(
                "/pos/checkout",
                { shift_id: shift.id, items: [{ variant_id: variant.id, quantity: 1 }], payment_method: "voucher" },
                cashier
              )
            )
          ).status
        ).toEqual(400)
        const { data: sale } = await api.post(
          "/pos/checkout",
          {
            shift_id: shift.id,
            items: [{ variant_id: variant.id, quantity: 2 }],
            payment_method: "cash",
            customer_id: newCustomer.customer.id,
          },
          cashier
        )
        expect(sale.payment_method).toEqual("cash")
        expect(sale.order).toEqual(expect.objectContaining({ customer_id: newCustomer.customer.id, currency_code: "usd" }))
        expect(sale.order.items).toEqual([expect.objectContaining({ variant_sku: "SHIRT-L-BLACK" })])
        expect(Number(sale.order.items[0].quantity)).toEqual(2)
        const total = Number(sale.order.total)
        expect(total).toBeGreaterThan(0)

        // Close with the right count.
        const { data: closed } = await api.post("/pos/shifts/close", { shift_id: shift.id, counted_cash: 20 + total }, cashier)
        expect(closed.variance).toEqual(0)
        expect(Number(closed.shift.expected_cash)).toEqual(20 + total)

        // Report.
        const { data: report } = await api.get(`/admin/pos/shifts?register_id=${register.id}`, admin)
        expect(report.count).toEqual(1)
        expect(report.shifts[0]).toEqual(
          expect.objectContaining({
            id: shift.id,
            status: "closed",
            variance: 0,
            opened_by_name: "Sokha",
            register: expect.objectContaining({ name: "Till 1" }),
          })
        )
        const { data: none } = await api.get(`/admin/pos/shifts?cashier_id=pcash_other`, admin)
        expect(none.count).toEqual(0)
        const { data: future } = await api.get(`/admin/pos/shifts?from=2999-01-01`, admin)
        expect(future.count).toEqual(0)
        expect((await fail(api.get(`/admin/pos/shifts?status=lost`, admin))).status).toEqual(400)

        // A register in another channel can't sell this product.
        await api.post(`/admin/pos/registers/${register.id}`, { sales_channel_id: other.id }, admin)
        expect((await fail(api.get(`/pos/products/lookup?code=SHIRT-L-BLACK&shift_id=${shift.id}`, cashier))).status).toEqual(404)
      })

      it("keeps cashiers and admins apart, and a deactivated cashier is locked out", async () => {
        const { admin, cashier, cashierId } = await setup()
        expect((await fail(api.get("/admin/pos/registers", cashier))).status).toEqual(401)
        expect((await fail(api.get("/admin/pos/shifts", cashier))).status).toEqual(401)
        expect((await fail(api.get("/pos/registers", admin))).status).toEqual(401)

        const { data } = await api.post(`/admin/pos/cashiers/${cashierId}`, { is_active: false }, admin)
        expect(data.cashier.is_active).toEqual(false)
        expect((await fail(api.get("/pos/registers", cashier))).status).toEqual(401)
        expect((await fail(api.post(`/admin/pos/cashiers/pcash_missing`, { is_active: false }, admin))).status).toEqual(404)
        expect((await fail(api.post(`/admin/pos/cashiers/${cashierId}`, { email: "x@example.com" }, admin))).status).toEqual(400)
      })
    })
  },
})
