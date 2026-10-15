import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { backendPosPath } from "../proxy-path.ts"
import { seal, unseal } from "../session-seal.ts"

// TASKS P2-10: the sealed session cookie and the proxy's allow-list.

describe("session cookie (TASKS P2-10)", () => {
  it("round-trips the token and never shows it in the cookie", () => {
    const token = "eyJhbGciOiJIUzI1NiJ9.payload.signature"
    const sealed = seal("secret-a", token)
    assert.ok(!sealed.includes("payload"))
    assert.equal(unseal("secret-a", sealed), token)
    assert.notEqual(seal("secret-a", token), sealed, "a fresh IV each time")
  })

  it("refuses another secret, tampering and garbage", () => {
    const sealed = seal("secret-a", "token")
    assert.equal(unseal("secret-b", sealed), null)
    const bytes = Buffer.from(sealed, "base64url")
    bytes[bytes.length - 1] ^= 1
    assert.equal(unseal("secret-a", bytes.toString("base64url")), null)
    assert.equal(unseal("secret-a", "not-a-cookie"), null)
    assert.equal(unseal("secret-a", ""), null)
    assert.equal(unseal("secret-a", undefined), null)
  })
})

describe("proxy allow-list (TASKS P2-10)", () => {
  it("forwards only the cashier routes", () => {
    assert.equal(backendPosPath("GET", ["registers"]), "/pos/registers")
    assert.equal(backendPosPath("POST", ["shifts", "open"]), "/pos/shifts/open")
    assert.equal(backendPosPath("POST", ["shifts", "close"]), "/pos/shifts/close")
    assert.equal(backendPosPath("POST", ["checkout"]), "/pos/checkout")
    assert.equal(backendPosPath("GET", ["customers"]), "/pos/customers")
    assert.equal(backendPosPath("POST", ["customers"]), "/pos/customers")
    assert.equal(backendPosPath("GET", ["products", "lookup"]), "/pos/products/lookup")
    assert.equal(backendPosPath("GET", ["cashiers", "me"]), "/pos/cashiers/me")
  })

  it("refuses other methods, paths and tricks", () => {
    assert.equal(backendPosPath("GET", ["checkout"]), null)
    assert.equal(backendPosPath("POST", ["registers"]), null)
    assert.equal(backendPosPath("DELETE", ["customers"]), null)
    assert.equal(backendPosPath("POST", ["cashiers", "accept"]), null)
    assert.equal(backendPosPath("GET", [".."]), null)
    assert.equal(backendPosPath("GET", ["..", "admin", "users"]), null)
    assert.equal(backendPosPath("GET", ["registers%2F.."]), null)
    assert.equal(backendPosPath("GET", []), null)
  })
})
