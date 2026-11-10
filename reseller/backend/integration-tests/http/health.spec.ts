import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

// Runner + api client: MEDUSA_SKILL.md §10 (learn/debugging-and-testing/testing-tools).
jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("Backend boots (Phase 0 smoke)", () => {
      it("GET /health returns 200", async () => {
        const response = await api.get("/health")
        expect(response.status).toEqual(200)
      })

      it("rejects store requests without a publishable API key", async () => {
        const response = await api
          .get("/store/products")
          .catch((e: { response: { status: number } }) => e.response)
        expect(response.status).toEqual(400)
      })
    })
  },
})
