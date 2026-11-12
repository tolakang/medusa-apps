import { MathBN } from "@medusajs/framework/utils"
import { itemsValue, splitShipping } from "../shipping-split"

const bn = (n: number) => MathBN.convert(n)

// TASKS F-076 (owner: "Split across vendors").
describe("shipping split", () => {
  it("values items as unit price × quantity", () => {
    expect(
      itemsValue([
        { unit_price: 10, quantity: 2 },
        { unit_price: 5.5, quantity: 1 },
      ]).toNumber()
    ).toBe(25.5)
  })

  it("splits by item value and adds up to the parent when vendors have every item", () => {
    expect(splitShipping(3, [bn(20), bn(10)], bn(30))).toEqual([2, 1])
    const thirds = splitShipping(10, [bn(1), bn(1), bn(1)], bn(3))
    expect(thirds).toEqual([3.33, 3.33, 3.34])
    expect(thirds.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 10)
  })

  it("leaves the marketplace's own items their share on the parent", () => {
    // Vendor items 30 of 40: the vendor gets 3/4 of 4.
    expect(splitShipping(4, [bn(30)], bn(40))).toEqual([3])
  })

  it("gives nothing for free shipping or an empty order", () => {
    expect(splitShipping(0, [bn(10)], bn(10))).toEqual([0])
    expect(splitShipping(5, [bn(0)], bn(0))).toEqual([0])
  })

  it("rounds to the currency's decimals", () => {
    expect(splitShipping(1000, [bn(1), bn(2)], bn(3), 0)).toEqual([333, 667])
  })
})
