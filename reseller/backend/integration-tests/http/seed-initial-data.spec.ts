import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seedInitialData from "../../src/scripts/seed-initial-data"

// Runner + api client: MEDUSA_SKILL.md §10. createDefaultsWorkflow is what
// Medusa runs on first boot (core-flows defaults/workflows/create-defaults).
// The runner skips core migration scripts, so the test creates the shipping
// profile that `db:migrate` creates in production (@medusajs/medusa
// migration-scripts/migrate-product-shipping-profile: "Default Shipping
// Profile", type "default").
jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("seed-initial-data after first boot (TASKS F-017)", () => {
      it("reuses the first-boot sales channel and publishable key", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)

        // db:migrate, then first boot: Medusa's own default store, channel and key.
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        const {
          data: [firstBootKey],
        } = await query.graph({
          entity: "api_key",
          fields: ["id", "token"],
          filters: { type: "publishable" },
        })

        await seedInitialData({ container })

        const { data: channels } = await query.graph({
          entity: "sales_channel",
          fields: ["id"],
        })
        const { data: keys } = await query.graph({
          entity: "api_key",
          fields: ["id"],
          filters: { type: "publishable" },
        })
        const { data: stores } = await query.graph({
          entity: "store",
          fields: ["id"],
        })
        expect(channels).toHaveLength(1)
        expect(keys).toHaveLength(1)
        expect(stores).toHaveLength(1)

        // The key a storefront built after first boot uses sees the products.
        const response = await api.get("/store/products?fields=handle", {
          headers: { "x-publishable-api-key": firstBootKey.token },
        })
        expect(response.status).toEqual(200)
        expect(response.data.count).toEqual(4)
      })
    })
  },
})
