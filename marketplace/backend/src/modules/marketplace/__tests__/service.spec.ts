import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { MARKETPLACE_MODULE } from ".."
import { Vendor } from "../models/vendor"
import { VendorAdmin } from "../models/vendor-admin"
import { VendorPayout } from "../models/vendor-payout"
import MarketplaceModuleService from "../service"

jest.setTimeout(60 * 1000)

// TASKS P6-01: module `marketplace` with vendor, vendor_admin and
// vendor_payout (BUILD_PLAN §6.6).
moduleIntegrationTestRunner<MarketplaceModuleService>({
  moduleName: MARKETPLACE_MODULE,
  moduleModels: [Vendor, VendorAdmin, VendorPayout],
  resolve: "./src/modules/marketplace",
  testSuite: ({ service }) => {
    const vendor = (overrides: Record<string, unknown> = {}) =>
      service.createVendors({
        handle: "dara-crafts",
        name: "Dara Crafts",
        email: "dara@vendor.test",
        ...overrides,
      })

    const admin = (vendorId: string, overrides: Record<string, unknown> = {}) =>
      service.createVendorAdmins({
        vendor_id: vendorId,
        email: "owner@dara.test",
        ...overrides,
      })

    const payout = (vendorId: string, overrides: Record<string, unknown> = {}) =>
      service.createVendorPayouts({
        vendor_id: vendorId,
        amount: 90,
        currency_code: "usd",
        period: "2026-10",
        ...overrides,
      })

    describe("vendor", () => {
      it("stores the plan's fields with defaults", async () => {
        const created = await vendor()

        expect(created.id).toMatch(/^ven_/)
        expect(created).toEqual(
          expect.objectContaining({
            handle: "dara-crafts",
            name: "Dara Crafts",
            email: "dara@vendor.test",
            logo: null,
            status: "pending",
            commission_rate: null,
          })
        )
      })

      it("keeps a logo, a commission rate and a status", async () => {
        const created = await vendor({
          logo: "https://files.example.com/dara.png",
          commission_rate: 12.5,
          status: "active",
        })
        expect(created).toEqual(
          expect.objectContaining({
            logo: "https://files.example.com/dara.png",
            commission_rate: 12.5,
            status: "active",
          })
        )
        const suspended = await service.updateVendors({
          id: created.id,
          status: "suspended",
        })
        expect(suspended.status).toBe("suspended")
      })

      it("refuses a duplicate handle", async () => {
        await vendor()
        await expect(vendor({ email: "other@vendor.test" })).rejects.toThrow()
      })

      it.each(["Dara", "dara crafts", "-dara", "dara-", "dara--crafts", ""])(
        "refuses the handle %j",
        async (handle) => {
          await expect(vendor({ handle })).rejects.toThrow(/vendor_handle_format/)
        }
      )

      it.each([-1, 100.5])("refuses the commission rate %p", async (rate) => {
        await expect(vendor({ commission_rate: rate })).rejects.toThrow(
          /vendor_commission_rate_percent/
        )
      })

      it("accepts 0 and 100 percent", async () => {
        await expect(vendor({ commission_rate: 0 })).resolves.toBeTruthy()
        await expect(
          vendor({ handle: "other", commission_rate: 100 })
        ).resolves.toBeTruthy()
      })

      it("refuses an unknown status", async () => {
        await expect(vendor({ status: "approved" })).rejects.toThrow()
      })
    })

    describe("vendor_admin", () => {
      it("belongs to its vendor", async () => {
        const owner = await vendor()
        const created = await admin(owner.id, {
          first_name: "Dara",
          last_name: "Sok",
        })

        expect(created.id).toMatch(/^vadm_/)
        const [found] = await service.listVendorAdmins(
          { id: created.id },
          { relations: ["vendor"] }
        )
        expect(found).toEqual(
          expect.objectContaining({
            email: "owner@dara.test",
            first_name: "Dara",
            last_name: "Sok",
          })
        )
        expect(found.vendor.id).toBe(owner.id)

        const [withAdmins] = await service.listVendors(
          { id: owner.id },
          { relations: ["admins"] }
        )
        expect(withAdmins.admins.map((a) => a.id)).toEqual([created.id])
      })

      it("lets a vendor have several admins", async () => {
        const owner = await vendor()
        await admin(owner.id)
        await admin(owner.id, { email: "staff@dara.test" })
        expect(await service.listVendorAdmins({ vendor_id: owner.id })).toHaveLength(2)
      })

      it("allows one admin per email, across vendors", async () => {
        const owner = await vendor()
        const other = await vendor({ handle: "other", email: "o@vendor.test" })
        await admin(owner.id)
        await expect(admin(owner.id)).rejects.toThrow()
        await expect(admin(other.id)).rejects.toThrow()
      })

      it("needs a vendor", async () => {
        await expect(
          service.createVendorAdmins({ email: "lost@vendor.test" } as never)
        ).rejects.toThrow()
      })
    })

    describe("vendor_payout", () => {
      it("stores a pending payout for one period and currency", async () => {
        const owner = await vendor()
        const created = await payout(owner.id)

        expect(created.id).toMatch(/^vpay_/)
        expect(created).toEqual(
          expect.objectContaining({
            amount: 90,
            currency_code: "usd",
            period: "2026-10",
            status: "pending",
            paid_at: null,
            reference: null,
          })
        )
      })

      it("is marked paid with a date and a reference", async () => {
        const owner = await vendor()
        const created = await payout(owner.id)
        const paidAt = new Date("2026-11-02T03:00:00Z")
        const paid = await service.updateVendorPayouts({
          id: created.id,
          status: "paid",
          paid_at: paidAt,
          reference: "ABA-TRX-123",
        })
        expect(paid).toEqual(
          expect.objectContaining({ status: "paid", reference: "ABA-TRX-123" })
        )
        expect(new Date(paid.paid_at as Date).toISOString()).toBe(
          paidAt.toISOString()
        )
      })

      it("allows one payout per vendor, period and currency", async () => {
        const owner = await vendor()
        const other = await vendor({ handle: "other", email: "o@vendor.test" })
        await payout(owner.id)

        await expect(payout(owner.id)).rejects.toThrow()
        // Another month, another currency or another vendor is fine.
        await expect(payout(owner.id, { period: "2026-11" })).resolves.toBeTruthy()
        await expect(
          payout(owner.id, { currency_code: "khr" })
        ).resolves.toBeTruthy()
        await expect(payout(other.id)).resolves.toBeTruthy()
      })

      it("refuses a negative amount", async () => {
        const owner = await vendor()
        await expect(payout(owner.id, { amount: -0.01 })).rejects.toThrow(
          /vendor_payout_amount_not_negative/
        )
      })

      it.each(["2026-13", "2026-1", "26-10", "2026/10", "2026-00", ""])(
        "refuses the period %j",
        async (period) => {
          const owner = await vendor()
          await expect(payout(owner.id, { period })).rejects.toThrow(
            /vendor_payout_period_format/
          )
        }
      )

      it("refuses an unknown status", async () => {
        const owner = await vendor()
        await expect(payout(owner.id, { status: "approved" })).rejects.toThrow()
      })
    })
  },
})
