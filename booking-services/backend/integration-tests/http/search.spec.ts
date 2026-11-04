import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import type { SearchTypes } from "@medusajs/framework/types"
import {
  createApiKeysWorkflow,
  createDefaultsWorkflow,
  createProductsWorkflow,
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"
import { resolveProductIds } from "../../src/search/helpers/resolve-product-ids"

// Runner + api client: MEDUSA_SKILL.md §10. `/store/search` (Search Module,
// default since 2.21.1, BUILD_PLAN §6.1) always narrows product results to
// status "published" and the publishable key's sales channels
// (@medusajs/medusa api/store/search/route.js). The storefront sends
// `match_strategy: "last"` (storefront src/lib/search-client.ts).
// The runner restores a database snapshot before every test after the first
// (test-utils medusa-test-runner beforeEach), which leaves the search index
// empty, so every assertion that needs indexed products is in one test.
jest.setTimeout(120 * 1000)

type Hit = { id: string; document: { title?: string } }

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("product search (TASKS P1-06)", () => {
      let key: string

      const search = async (q: string, publishableKey = key) => {
        const response = await api.post(
          "/store/search",
          {
            queries: [
              {
                entity: "product",
                filters: { q },
                search_options: { match_strategy: "last" },
              },
            ],
          },
          { headers: { "x-publishable-api-key": publishableKey } }
        )
        return response.data.results[0].hits as Hit[]
      }

      // Indexing runs on events, so wait until the index has caught up.
      const searchUntil = async (q: string, done: (hits: Hit[]) => boolean) => {
        let hits: Hit[] = []
        for (let attempt = 0; attempt < 40; attempt++) {
          hits = await search(q)
          if (done(hits)) {
            return hits
          }
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
        return hits
      }

      const titles = (hits: Hit[]) => hits.map((h) => h.document.title).sort()

      beforeAll(async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seedInitialData({ container })
        const {
          data: [apiKey],
        } = await query.graph({
          entity: "api_key",
          fields: ["token"],
          filters: { type: "publishable" },
        })
        key = apiKey.token
      })

      it("finds published products of the key's sales channel by word prefix, and nothing else", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)

        // Prefix search, as the storefront sends it while the customer types.
        const hits = await searchUntil("swe", (h) => h.length >= 2)
        expect(titles(hits)).toEqual(["Medusa Sweatpants", "Medusa Sweatshirt"])
        expect(await search("xyznothing")).toHaveLength(0)

        // A key whose sales channel has no products sees none.
        const {
          result: [emptyChannel],
        } = await createSalesChannelsWorkflow(container).run({
          input: { salesChannelsData: [{ name: "Empty channel" }] },
        })
        const {
          result: [otherKey],
        } = await createApiKeysWorkflow(container).run({
          input: {
            api_keys: [{ title: "Other key", type: "publishable", created_by: "" }],
          },
        })
        await linkSalesChannelsToApiKeyWorkflow(container).run({
          input: { id: otherKey.id, add: [emptyChannel.id] },
        })
        expect(await search("", otherKey.token)).toHaveLength(0)
        expect(await search("")).toHaveLength(4)

        // Drafts are never returned.
        const {
          data: [channel],
        } = await query.graph({
          entity: "sales_channel",
          fields: ["id"],
          filters: { name: "Default Sales Channel" },
        })
        await createProductsWorkflow(container).run({
          input: {
            products: [
              { title: "Zebra published", status: ProductStatus.PUBLISHED },
              { title: "Zebra draft", status: ProductStatus.DRAFT },
            ].map((product) => ({
              ...product,
              sales_channels: [{ id: channel.id }],
              // createProductsWorkflow requires options (core-flows
              // validateProductInputStep); shape from its docs example.
              options: [{ title: "Size", values: ["One size"] }],
            })),
          },
        })
        const zebras = await searchUntil("zebra", (h) => h.length >= 1)
        expect(titles(zebras)).toEqual(["Zebra published"])
      })

      it("rejects a search without a publishable key", async () => {
        const response = await api
          .post("/store/search", {
            queries: [{ entity: "product", filters: { q: "swe" } }],
          })
          .catch((e: { response: { status: number } }) => e.response)
        expect(response.status).toEqual(400)
      })

      it("maps option and option value events to the products that use them (TASKS F-023)", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data: products } = await query.graph({
          entity: "product",
          fields: ["id", "options.id", "options.title", "options.values.id"],
          filters: { handle: ["t-shirt", "sweatshirt", "sweatpants", "shorts"] },
        })
        const size = products[0].options?.find((o) => o?.title === "Size")
        expect(size).toBeDefined()
        const context = { container: { query } } as unknown as SearchTypes.SearchIngestionContext
        const expected = products.map((p) => p.id).sort()

        const byOption = await resolveProductIds(
          { name: "product-option.updated", data: { id: size!.id } },
          context
        )
        expect([...new Set(byOption)].sort()).toEqual(expected)

        const byValue = await resolveProductIds(
          { name: "product-option-value.updated", data: { id: size!.values[0].id } },
          context
        )
        expect([...new Set(byValue)].sort()).toEqual(expected)
      })
    })
  },
})
