import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  createStockLocationsWorkflow,
} from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import type MarketplaceModuleService from "../../src/modules/marketplace/service"

jest.setTimeout(120 * 1000)

// TASKS P6-02 (plan §6.6): vendor → products, vendor → (child) orders,
// vendor → stock locations. A vendor has many of each; each product, order
// and location has at most one vendor.
medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("vendor links (TASKS P6-02)", () => {
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const link = () => getContainer().resolve(ContainerRegistrationKeys.LINK)
      const marketplace = () =>
        getContainer().resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

      const newVendor = (handle: string) =>
        marketplace().createVendors({
          handle,
          name: handle,
          email: `${handle}@vendor.test`,
        })

      const newProducts = async (titles: string[]) => {
        const { result } = await createProductsWorkflow(getContainer()).run({
          input: {
            products: titles.map((title) => ({
              title,
              options: [{ title: "Size", values: ["One size"] }],
            })),
          },
        })
        return result
      }

      const newOrder = () =>
        getContainer()
          .resolve(Modules.ORDER)
          .createOrders({ currency_code: "usd", email: "buyer@test.test" })

      const newLocations = async (names: string[]) => {
        const { result } = await createStockLocationsWorkflow(getContainer()).run({
          input: { locations: names.map((name) => ({ name })) },
        })
        return result
      }

      const linkTo = (vendorId: string, other: Record<string, Record<string, string>>) =>
        link().create({ [MARKETPLACE_MODULE]: { vendor_id: vendorId }, ...other })

      it("a vendor has many products, each product one vendor", async () => {
        const dara = await newVendor("dara")
        const sok = await newVendor("sok")
        const [scarf, basket, own] = await newProducts(["Scarf", "Basket", "Own product"])

        await linkTo(dara.id, { [Modules.PRODUCT]: { product_id: scarf.id } })
        await linkTo(dara.id, { [Modules.PRODUCT]: { product_id: basket.id } })

        const {
          data: [vendor],
        } = await query().graph({
          entity: "vendor",
          fields: ["id", "products.id", "products.title"],
          filters: { id: dara.id },
        })
        expect((vendor.products ?? []).map((p) => p?.title).sort()).toEqual(["Basket", "Scarf"])

        const { data: products } = await query().graph({
          entity: "product",
          fields: ["id", "vendor.id"],
          filters: { id: [scarf.id, own.id] },
        })
        const vendorOf = Object.fromEntries(products.map((p) => [p.id, p.vendor?.id ?? null]))
        expect(vendorOf).toEqual({ [scarf.id]: dara.id, [own.id]: null })

        // The same product can't get a second vendor.
        await expect(
          linkTo(sok.id, { [Modules.PRODUCT]: { product_id: scarf.id } })
        ).rejects.toThrow(/multiple links/i)
      })

      it("a vendor has many orders, each order one vendor", async () => {
        const dara = await newVendor("dara")
        const sok = await newVendor("sok")
        const first = await newOrder()
        const second = await newOrder()

        await linkTo(dara.id, { [Modules.ORDER]: { order_id: first.id } })
        await linkTo(dara.id, { [Modules.ORDER]: { order_id: second.id } })

        const {
          data: [vendor],
        } = await query().graph({
          entity: "vendor",
          fields: ["id", "orders.id"],
          filters: { id: dara.id },
        })
        expect((vendor.orders ?? []).map((o) => o?.id).sort()).toEqual([first.id, second.id].sort())

        const {
          data: [order],
        } = await query().graph({
          entity: "order",
          fields: ["id", "vendor.id"],
          filters: { id: first.id },
        })
        expect(order.vendor?.id).toEqual(dara.id)

        await expect(
          linkTo(sok.id, { [Modules.ORDER]: { order_id: first.id } })
        ).rejects.toThrow(/multiple links/i)
      })

      it("a vendor has many stock locations, each location one vendor", async () => {
        const dara = await newVendor("dara")
        const sok = await newVendor("sok")
        const [pp, siemReap] = await newLocations(["Dara PP", "Dara Siem Reap"])

        await linkTo(dara.id, { [Modules.STOCK_LOCATION]: { stock_location_id: pp.id } })
        await linkTo(dara.id, {
          [Modules.STOCK_LOCATION]: { stock_location_id: siemReap.id },
        })

        const {
          data: [vendor],
        } = await query().graph({
          entity: "vendor",
          fields: ["id", "stock_locations.id"],
          filters: { id: dara.id },
        })
        expect((vendor.stock_locations ?? []).map((l) => l?.id).sort()).toEqual(
          [pp.id, siemReap.id].sort()
        )

        const {
          data: [location],
        } = await query().graph({
          entity: "stock_location",
          fields: ["id", "vendor.id"],
          filters: { id: pp.id },
        })
        expect(location.vendor?.id).toEqual(dara.id)

        await expect(
          linkTo(sok.id, { [Modules.STOCK_LOCATION]: { stock_location_id: pp.id } })
        ).rejects.toThrow(/multiple links/i)
      })
    })
  },
})
