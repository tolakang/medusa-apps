import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createDefaultsWorkflow,
  createShippingProfilesWorkflow,
} from "@medusajs/medusa/core-flows"
import seed from "../../src/scripts/seed"

// Runner + api client: MEDUSA_SKILL.md §10. Preconditions as in
// seed-initial-data.spec.ts: the shipping profile db:migrate creates, then the
// first-boot defaults (createDefaultsWorkflow).
jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("seed: Cambodia shop (TASKS P1-02)", () => {
      it("creates the Cambodia region, currencies, tax region and Phnom Penh delivery, and is safe to re-run", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)

        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()

        await seed({ container })
        await seed({ container })

        const { data: regions } = await query.graph({
          entity: "region",
          fields: ["id", "name", "currency_code", "countries.iso_2"],
        })
        expect(regions).toHaveLength(1)
        expect(regions[0].name).toEqual("Cambodia")
        expect(regions[0].currency_code).toEqual("usd")
        expect(regions[0].countries?.map((c) => c?.iso_2)).toEqual(["kh"])

        const {
          data: [store],
        } = await query.graph({
          entity: "store",
          fields: [
            "default_region_id",
            "supported_currencies.currency_code",
            "supported_currencies.is_default",
          ],
        })
        expect(store.default_region_id).toEqual(regions[0].id)
        const currencies = (store.supported_currencies ?? []).map((c) => [
          c?.currency_code,
          c?.is_default,
        ])
        // Exactly USD (default) + KHR: the first-boot EUR is dropped (no region uses it).
        expect(currencies).toHaveLength(2)
        expect(currencies).toEqual(
          expect.arrayContaining([
            ["usd", true],
            ["khr", false],
          ])
        )

        const { data: taxRegions } = await query.graph({
          entity: "tax_region",
          fields: ["country_code"],
        })
        expect(taxRegions.map((t) => t.country_code)).toEqual(["kh"])

        const { data: shippingOptions } = await query.graph({
          entity: "shipping_option",
          fields: ["name"],
        })
        expect(shippingOptions.map((o) => o.name)).toEqual([
          "Phnom Penh Delivery",
        ])

        // The first-boot key sees the region through the store API.
        const {
          data: [key],
        } = await query.graph({
          entity: "api_key",
          fields: ["token"],
          filters: { type: "publishable" },
        })
        const response = await api.get("/store/regions", {
          headers: { "x-publishable-api-key": key.token },
        })
        expect(response.status).toEqual(200)
        expect(response.data.regions.map((r) => r.name)).toEqual(["Cambodia"])
      })
    })
  },
})
