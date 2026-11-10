import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  createSalesChannelsWorkflow,
  createStockLocationsWorkflow,
} from "@medusajs/medusa/core-flows"
import { SELLER_MODULE } from "../../src/modules/seller"
import { createSellerWorkflow } from "../../src/workflows/seller/create-seller"

jest.setTimeout(120 * 1000)

// TASKS P5-02 (plan §6.5): seller ↔ sales channel, one to one; the channel's
// publishable key is the seller's storefront key.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("seller ↔ sales channel (TASKS P5-02)", () => {
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const link = () => getContainer().resolve(ContainerRegistrationKeys.LINK)

      const newSeller = (handle = "sok-shop") =>
        createSellerWorkflow(getContainer()).run({
          input: { handle, name: "Sok Shop", email: `${handle}@seller.test` },
        })

      it("creates the seller with a channel, a key and the stock locations", async () => {
        const {
          result: [location],
        } = await createStockLocationsWorkflow(getContainer()).run({
          input: { locations: [{ name: "Phnom Penh warehouse" }] },
        })

        const { result } = await newSeller()
        expect(result.seller.handle).toEqual("sok-shop")
        expect(result.publishable_key.token).toMatch(/^pk_/)

        const {
          data: [seller],
        } = await query().graph({
          entity: "seller",
          fields: ["id", "sales_channel.id", "sales_channel.name"],
          filters: { id: result.seller.id },
        })
        expect(seller.sales_channel).toEqual(
          expect.objectContaining({
            id: result.sales_channel.id,
            name: "Seller: Sok Shop",
          })
        )

        const {
          data: [channel],
        } = await query().graph({
          entity: "sales_channel",
          fields: ["id", "seller.id", "stock_locations.id", "publishable_api_keys.id"],
          filters: { id: result.sales_channel.id },
        })
        expect(channel.seller?.id).toEqual(result.seller.id)
        expect(channel.stock_locations?.map((l) => l?.id)).toEqual([location.id])
        expect(channel.publishable_api_keys?.map((k) => k?.id)).toEqual([
          result.publishable_key.id,
        ])
      })

      it("the seller's key sees only the seller's channel", async () => {
        const { result } = await newSeller()
        const {
          result: [other],
        } = await createSalesChannelsWorkflow(getContainer()).run({
          input: { salesChannelsData: [{ name: "Your own shop" }] },
        })
        await createProductsWorkflow(getContainer()).run({
          input: {
            products: [
              { title: "Seller product", channel: result.sales_channel.id },
              { title: "Own-shop product", channel: other.id },
            ].map(({ title, channel }) => ({
              title,
              status: ProductStatus.PUBLISHED,
              sales_channels: [{ id: channel }],
              options: [{ title: "Size", values: ["One size"] }],
            })),
          },
        })

        const { data } = await api.get("/store/products?fields=title", {
          headers: { "x-publishable-api-key": result.publishable_key.token },
        })
        expect(data.products.map((p) => p.title)).toEqual(["Seller product"])
      })

      it("is one to one: no second channel for a seller, no second seller for a channel", async () => {
        const first = (await newSeller("first")).result
        const second = (await newSeller("second")).result

        await expect(
          link().create({
            [SELLER_MODULE]: { seller_id: first.seller.id },
            [Modules.SALES_CHANNEL]: { sales_channel_id: second.sales_channel.id },
          })
        ).rejects.toThrow(/multiple links/)
        // Each seller still has exactly its own channel.
        const { data: sellers } = await query().graph({
          entity: "seller",
          fields: ["id", "sales_channel.id"],
        })
        expect(
          Object.fromEntries(sellers.map((s) => [s.id, s.sales_channel?.id]))
        ).toEqual({
          [first.seller.id]: first.sales_channel.id,
          [second.seller.id]: second.sales_channel.id,
        })

        const {
          result: [spare],
        } = await createSalesChannelsWorkflow(getContainer()).run({
          input: { salesChannelsData: [{ name: "Spare" }] },
        })
        await expect(
          link().create({
            [SELLER_MODULE]: { seller_id: first.seller.id },
            [Modules.SALES_CHANNEL]: { sales_channel_id: spare.id },
          })
        ).rejects.toThrow(/multiple links/)
      })

      it("a failed creation leaves no channel, key or seller behind", async () => {
        await newSeller()
        const count = async () => {
          const [channels, keys, sellers] = await Promise.all(
            ["sales_channel", "api_key", "seller"].map((entity) =>
              query().graph({ entity, fields: ["id"] })
            )
          )
          return [channels.data.length, keys.data.length, sellers.data.length]
        }
        const before = await count()

        // A failed run() rejects with a plain object, not an Error
        // (MEDUSA_SKILL §6), so match its message.
        // Same handle: the seller step fails first.
        await expect(newSeller()).rejects.toMatchObject({
          message: expect.stringContaining("already exists"),
        })
        expect(await count()).toEqual(before)

        // Bad domain: also refused, nothing left over.
        await expect(
          createSellerWorkflow(getContainer()).run({
            input: { handle: "dara", name: "Dara", email: "d@s.test", domain: "Not A Domain" },
          })
        ).rejects.toMatchObject({
          message: expect.stringContaining("seller_domain_format"),
        })
        expect(await count()).toEqual(before)
      })
    })
  },
})
