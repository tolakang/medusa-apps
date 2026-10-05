import { safeEqual } from "../safe-equal"

describe("safeEqual", () => {
  it("accepts only the exact expected string", () => {
    expect(safeEqual("secret-123", "secret-123")).toBe(true)
    expect(safeEqual("secret-124", "secret-123")).toBe(false)
    expect(safeEqual("secret", "secret-123")).toBe(false)
    expect(safeEqual("", "secret-123")).toBe(false)
  })

  it("refuses anything that is not a string", () => {
    expect(safeEqual(undefined, "secret-123")).toBe(false)
    expect(safeEqual(["secret-123"], "secret-123")).toBe(false)
    expect(safeEqual(123, "123")).toBe(false)
  })
})
