import { inviteBody, registerBody } from "../pos-setup"

describe("inviteBody", () => {
  it("trims and lowercases a valid invite", () => {
    expect(inviteBody({ name: "  Dara ", email: " Dara@Shop.test " })).toEqual({ name: "Dara", email: "dara@shop.test" })
  })

  it("refuses a missing name or a bad email", () => {
    expect(inviteBody({ name: " ", email: "a@b.co" })).toBeNull()
    expect(inviteBody({ name: "Dara", email: "dara" })).toBeNull()
    expect(inviteBody({ name: "x".repeat(101), email: "a@b.co" })).toBeNull()
  })
})

describe("registerBody", () => {
  const ok = { name: " Front till ", code: " T1 ", stock_location_id: "sloc_1", sales_channel_id: "sc_1" }

  it("trims a complete register", () => {
    expect(registerBody(ok)).toEqual({ name: "Front till", code: "T1", stock_location_id: "sloc_1", sales_channel_id: "sc_1" })
  })

  it("needs a name, a code, a location and a channel", () => {
    expect(registerBody({ ...ok, name: "" })).toBeNull()
    expect(registerBody({ ...ok, code: " " })).toBeNull()
    expect(registerBody({ ...ok, stock_location_id: "" })).toBeNull()
    expect(registerBody({ ...ok, sales_channel_id: "" })).toBeNull()
  })
})
