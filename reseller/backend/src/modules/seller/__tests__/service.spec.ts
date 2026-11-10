import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { SELLER_MODULE } from ".."
import { Seller } from "../models/seller"
import { SellerCommission } from "../models/seller-commission"
import SellerModuleService from "../service"

jest.setTimeout(60 * 1000)

// TASKS P5-01: module `seller` with seller and seller_commission
// (BUILD_PLAN §6.5).
moduleIntegrationTestRunner<SellerModuleService>({
  moduleName: SELLER_MODULE,
  moduleModels: [Seller, SellerCommission],
  resolve: "./src/modules/seller",
  testSuite: ({ service }) => {
    const seller = (overrides: Record<string, unknown> = {}) =>
      service.createSellers({
        handle: "sok-shop",
        name: "Sok Shop",
        email: "sok@seller.test",
        ...overrides,
      })

    const commission = (sellerId: string, overrides: Record<string, unknown> = {}) =>
      service.createSellerCommissions({
        seller_id: sellerId,
        order_id: "order_1",
        order_total: 200,
        rate: 10,
        amount: 20,
        currency_code: "usd",
        ...overrides,
      })

    describe("seller", () => {
      it("stores the plan's fields with defaults", async () => {
        const created = await seller()

        expect(created.id).toMatch(/^sel_/)
        expect(created).toEqual(
          expect.objectContaining({
            handle: "sok-shop",
            name: "Sok Shop",
            email: "sok@seller.test",
            domain: null,
            status: "pending",
            commission_rate: null,
          })
        )
      })

      it("keeps a commission rate and a domain", async () => {
        const created = await seller({
          domain: "shop.sok.com",
          commission_rate: 12.5,
          status: "active",
        })
        expect(created).toEqual(
          expect.objectContaining({
            domain: "shop.sok.com",
            commission_rate: 12.5,
            status: "active",
          })
        )
      })

      it("refuses a duplicate handle or domain", async () => {
        await seller({ domain: "shop.sok.com" })
        await expect(seller({ email: "other@seller.test" })).rejects.toThrow()
        await expect(
          seller({ handle: "other", domain: "shop.sok.com" })
        ).rejects.toThrow()
      })

      it.each(["Sok", "sok shop", "sok_shop", "-sok", "sok-", "sok--shop", ""])(
        "refuses the handle %p",
        async (handle) => {
          await expect(seller({ handle })).rejects.toThrow(/seller_handle_format/)
        }
      )

      it.each([
        "Shop.Sok.com",
        "https://shop.sok.com",
        "shop.sok.com/path",
        "localhost",
        "shop..sok.com",
      ])("refuses the domain %p", async (domain) => {
        await expect(seller({ domain })).rejects.toThrow(/seller_domain_format/)
      })

      it.each([-1, 100.5])("refuses the commission rate %p", async (rate) => {
        await expect(seller({ commission_rate: rate })).rejects.toThrow(
          /seller_commission_rate_percent/
        )
      })

      it("refuses an unknown status", async () => {
        await expect(seller({ status: "closed" })).rejects.toThrow()
      })
    })

    describe("seller_commission", () => {
      it("stores a commission for one order of one seller", async () => {
        const owner = await seller()
        const created = await commission(owner.id)

        expect(created.id).toMatch(/^scom_/)
        expect(created).toEqual(
          expect.objectContaining({
            order_id: "order_1",
            order_total: 200,
            rate: 10,
            amount: 20,
            currency_code: "usd",
            status: "pending",
            paid_at: null,
          })
        )

        const [listed] = await service.listSellerCommissions(
          { seller_id: owner.id },
          { relations: ["seller"] }
        )
        expect(listed.seller.id).toEqual(owner.id)
      })

      it("allows only one commission per order", async () => {
        const owner = await seller()
        const other = await seller({ handle: "dara", email: "dara@seller.test" })
        await commission(owner.id)
        await expect(commission(owner.id)).rejects.toThrow()
        await expect(commission(other.id)).rejects.toThrow()
        await expect(commission(owner.id, { order_id: "order_2" })).resolves.toBeTruthy()
      })

      it("moves through the plan's statuses", async () => {
        const owner = await seller()
        const created = await commission(owner.id)
        for (const status of ["approved", "paid", "cancelled"] as const) {
          const [updated] = await service.updateSellerCommissions([
            {
              id: created.id,
              status,
              paid_at: status === "paid" ? new Date("2026-12-01T00:00:00Z") : null,
            },
          ])
          expect(updated.status).toEqual(status)
        }
        await expect(
          service.updateSellerCommissions([{ id: created.id, status: "lost" as never }])
        ).rejects.toThrow()
      })

      it("refuses a negative amount or a rate above 100", async () => {
        const owner = await seller()
        await expect(commission(owner.id, { amount: -1 })).rejects.toThrow(
          /seller_commission_amount_not_negative/
        )
        await expect(
          commission(owner.id, { order_id: "order_3", rate: 101 })
        ).rejects.toThrow(/seller_commission_rate_percent/)
      })
    })
  },
})
