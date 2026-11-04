import type { MedusaContainer } from "@medusajs/framework/types"
import handler, { config } from "../storefront-revalidate"

// Fake URL and secret only: fetch is mocked (TASKS P1-10).
const logger = { warn: jest.fn() }
const container = { resolve: () => logger } as unknown as MedusaContainer
const run = (name = "product.updated") =>
  handler({ event: { name, data: { id: "prod_1" } }, container, pluginOptions: {} })

describe("storefront revalidate subscriber", () => {
  const fetchMock = jest.fn()
  const saved = { ...process.env }
  beforeEach(() => {
    fetchMock.mockReset()
    logger.warn.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
    process.env = { ...saved, STOREFRONT_URL: "https://shop.example.com/", REVALIDATE_SECRET: "s3cret" }
  })
  afterAll(() => {
    process.env = saved
  })

  it("posts to the storefront's /api/revalidate with the secret", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
    await run()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toEqual("https://shop.example.com/api/revalidate")
    expect(init.method).toEqual("POST")
    expect(init.headers).toEqual({ "x-revalidate-secret": "s3cret" })
  })

  it("does nothing without STOREFRONT_URL or REVALIDATE_SECRET", async () => {
    delete process.env.REVALIDATE_SECRET
    await run()
    process.env.REVALIDATE_SECRET = "s3cret"
    delete process.env.STOREFRONT_URL
    await run()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("never throws when the storefront is down or refuses, it only warns", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"))
    await expect(run()).resolves.toBeUndefined()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 })
    await expect(run("product-variant.updated")).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalledTimes(2)
    expect(logger.warn.mock.calls[1][0]).toContain("returned 401")
  })

  it("listens to catalog events", () => {
    expect(config.event).toEqual(
      expect.arrayContaining([
        "product.updated",
        "product-variant.updated",
        "product-category.updated",
        "product-collection.updated",
        "region.updated",
      ])
    )
  })
})
