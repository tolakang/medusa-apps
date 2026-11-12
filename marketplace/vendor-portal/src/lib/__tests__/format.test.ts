import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { day, money, productBody, toFulfil } from "../format.ts"
import { seal, unseal } from "../session-seal.ts"

// TASKS P6-09: portal helpers and the sealed session cookie.

describe("format (TASKS P6-09)", () => {
  it("formats money and days", () => {
    assert.equal(money(12.5, "usd"), "$12.50")
    assert.equal(money("3", "USD"), "$3.00")
    assert.equal(money(null, "usd"), "$0.00")
    assert.match(money(1, "zzz"), /^ZZZ\s1\.00$/)
    assert.equal(day("2026-11-10T15:00:00Z"), "2026-11-10")
    assert.equal(day(null), "")
    assert.equal(day("nope"), "")
  })

  it("turns the product form into the backend's body", () => {
    const body = productBody({ title: " Silk Scarf ", price: "18.5", sku: "SC-1", status: "proposed" })
    assert.ok(typeof body !== "string")
    assert.equal(body.title, "Silk Scarf")
    assert.equal(body.status, "proposed")
    assert.deepEqual(body.variants[0].prices, [{ amount: 18.5, currency_code: "usd" }])
    assert.equal(body.variants[0].sku, "SC-1")
    assert.equal(body.description, undefined)
    // A vendor can't publish (the marketplace does), so anything else is a draft.
    const draft = productBody({ title: "Mat", price: "5", status: "published" })
    assert.ok(typeof draft !== "string" && draft.status === "draft")
  })

  it("refuses a product form without a name or a price", () => {
    assert.equal(productBody({ title: "", price: "5" }), "Give the product a name.")
    for (const price of ["", "0", "-1", "abc"]) {
      assert.equal(productBody({ title: "X", price }), "Enter a price above 0, e.g. 12.50.")
    }
    assert.equal(productBody({ title: "X", price: "1", currency: "dollars" }), "Choose a currency.")
  })

  it("counts what's left to fulfil", () => {
    assert.equal(toFulfil({ a: 2, b: 0, c: 1 }), 3)
    assert.equal(toFulfil(undefined), 0)
  })
})

describe("session cookie (TASKS P6-09)", () => {
  it("round-trips the token, hides it, and refuses another secret or tampering", () => {
    const sealed = seal("secret-a", "eyJhbGci.payload.sig")
    assert.ok(!sealed.includes("payload"))
    assert.equal(unseal("secret-a", sealed), "eyJhbGci.payload.sig")
    assert.equal(unseal("secret-b", sealed), null)
    const bytes = Buffer.from(sealed, "base64url")
    bytes[bytes.length - 1] ^= 1
    assert.equal(unseal("secret-a", bytes.toString("base64url")), null)
    assert.equal(unseal("secret-a", undefined), null)
  })
})
