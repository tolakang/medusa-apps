import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import {
  addLine,
  cartTotal,
  changeDue,
  checkoutItems,
  formatMoney,
  itemCount,
  lineFromVariant,
  lineTotal,
  quickTender,
  setQuantity,
  type CartLine,
} from "../cart.ts"

// TASKS P2-10: the till's cart logic (`pnpm test`, Node's test runner).

const shirt = lineFromVariant({
  id: "variant_1",
  title: "L / Black",
  sku: "SHIRT-L-BLACK",
  price: 10.1,
  product: { title: "Medusa T-Shirt" },
})
const mug = lineFromVariant({ id: "variant_2", title: "Mug", sku: null, price: 0.2, product: { title: "Mug" } })

describe("cart (TASKS P2-10)", () => {
  it("builds a line from a scanned variant", () => {
    assert.deepEqual(shirt, {
      variant_id: "variant_1",
      title: "Medusa T-Shirt",
      variant_title: "L / Black",
      sku: "SHIRT-L-BLACK",
      unit_price: 10.1,
      quantity: 1,
    })
    assert.equal(mug.variant_title, null)
  })

  it("adds one per scan of the same item and keeps other lines", () => {
    let cart: CartLine[] = []
    cart = addLine(cart, shirt)
    cart = addLine(cart, mug)
    cart = addLine(cart, shirt)
    assert.deepEqual(
      cart.map((l) => [l.variant_id, l.quantity]),
      [
        ["variant_1", 2],
        ["variant_2", 1],
      ]
    )
    assert.equal(itemCount(cart), 3)
    assert.deepEqual(checkoutItems(cart), [
      { variant_id: "variant_1", quantity: 2 },
      { variant_id: "variant_2", quantity: 1 },
    ])
  })

  it("sets quantities, removes at 0 and caps at 1000", () => {
    let cart = addLine([], shirt)
    cart = setQuantity(cart, "variant_1", 5.7)
    assert.equal(cart[0].quantity, 5)
    assert.equal(setQuantity(cart, "variant_1", 5000)[0].quantity, 1000)
    assert.deepEqual(setQuantity(cart, "variant_1", 0), [])
    assert.deepEqual(setQuantity(cart, "variant_1", -3), [])
  })

  it("totals in cents (no float drift)", () => {
    let cart = addLine([], { ...mug, quantity: 1 })
    cart = addLine(cart, lineFromVariant({ id: "v3", title: null, sku: null, price: 0.1, product: { title: "Pen" } }))
    assert.equal(cartTotal(cart), 0.3)
    assert.equal(lineTotal({ ...shirt, quantity: 3 }), 30.3)
    assert.equal(lineTotal({ ...shirt, unit_price: null }), null)
  })

  it("computes change only when enough cash is tendered", () => {
    assert.equal(changeDue(12.5, 20), 7.5)
    assert.equal(changeDue(12.5, 12.5), 0)
    assert.equal(changeDue(12.5, 12.49), null)
    assert.equal(changeDue(0.3, 0.1 + 0.2), 0)
    assert.equal(changeDue(5, Number.NaN), null)
  })

  it("suggests the exact amount and round notes above it", () => {
    assert.deepEqual(quickTender(12.5), [12.5, 13, 15, 20])
    assert.deepEqual(quickTender(20), [20, 50, 100])
  })

  it("formats money in the shift currency", () => {
    assert.equal(formatMoney(12.5, "usd"), "$12.50")
    assert.equal(formatMoney(null, "usd"), "–")
    assert.ok(formatMoney(4000, "khr").includes("4,000"))
  })
})
