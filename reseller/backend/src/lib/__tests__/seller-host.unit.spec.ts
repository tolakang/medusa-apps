import { normalizeHost } from "../../modules/seller/host"

// TASKS P5-07: a request host as sellers' domains are stored.
describe("normalizeHost", () => {
  it.each([
    ["shop.sok.com", "shop.sok.com"],
    ["Shop.Sok.COM", "shop.sok.com"],
    ["shop.sok.com:8000", "shop.sok.com"],
    ["shop.sok.com.", "shop.sok.com"],
    ["shop.sok.com, proxy.internal", "shop.sok.com"],
    ["  shop.sok.com  ", "shop.sok.com"],
  ])("%p → %p", (raw, host) => {
    expect(normalizeHost(raw)).toEqual(host)
  })

  it.each([null, undefined, "", "   ", "shop sok.com", "shop/sok.com", "<x>"])(
    "refuses %p",
    (raw) => {
      expect(normalizeHost(raw)).toBeNull()
    }
  )
})
