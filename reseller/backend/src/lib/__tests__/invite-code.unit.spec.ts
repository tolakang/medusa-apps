import { inviteCode, inviteCodeMatches } from "../invite-code"

describe("invite codes (REVIEW_FIXES B11)", () => {
  it("gives each invitation its own stable, readable code", () => {
    const code = inviteCode("seller", "sel_1")
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/)
    expect(inviteCode("seller", "sel_1")).toEqual(code)
    expect(inviteCode("seller", "sel_2")).not.toEqual(code)
    expect(inviteCode("cashier", "sel_1")).not.toEqual(code)
  })

  it("accepts the code however it is typed, and nothing else", () => {
    const code = inviteCode("seller", "sel_1")
    expect(inviteCodeMatches("seller", "sel_1", code)).toBe(true)
    expect(inviteCodeMatches("seller", "sel_1", ` ${code.toLowerCase().replace("-", " ")} `)).toBe(true)
    expect(inviteCodeMatches("seller", "sel_2", code)).toBe(false)
    expect(inviteCodeMatches("seller", "sel_1", "AAAAA-AAAAA")).toBe(false)
    expect(inviteCodeMatches("seller", "sel_1", "")).toBe(false)
    expect(inviteCodeMatches("seller", "sel_1", undefined)).toBe(false)
  })

  it("depends on the server secret", () => {
    const before = inviteCode("seller", "sel_1")
    const saved = process.env.INVITE_CODE_SECRET
    process.env.INVITE_CODE_SECRET = "another-secret"
    expect(inviteCode("seller", "sel_1")).not.toEqual(before)
    process.env.INVITE_CODE_SECRET = saved
    if (saved === undefined) delete process.env.INVITE_CODE_SECRET
  })
})
