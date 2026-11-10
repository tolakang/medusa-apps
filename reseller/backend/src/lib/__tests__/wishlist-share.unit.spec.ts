import { createShareToken, readShareToken, shareDays } from "../wishlist-share"

describe("wishlist share links (TASKS P1-19)", () => {
  const now = Date.UTC(2026, 9, 6)

  it("reads back its own token until it expires after 30 days", () => {
    const { token, expires_at } = createShareToken("wishlist_01ABC", "secret", now, 30)
    expect(expires_at).toEqual(new Date(now + 30 * 86_400_000).toISOString())
    expect(readShareToken(token, "secret", now)).toEqual("wishlist_01ABC")
    expect(readShareToken(token, "secret", now + 30 * 86_400_000)).toBeNull()
  })

  it("refuses another secret, a changed ID or expiry, and malformed tokens", () => {
    const { token } = createShareToken("wishlist_01ABC", "secret", now, 30)
    const [id, expires, signature] = token.split(".")
    expect(readShareToken(token, "other-secret", now)).toBeNull()
    expect(readShareToken(`wishlist_01XYZ.${expires}.${signature}`, "secret", now)).toBeNull()
    expect(readShareToken(`${id}.${Number(expires) + 86_400}.${signature}`, "secret", now)).toBeNull()
    for (const bad of ["", "a.b", `${id}.${expires}`, `${id}.soon.${signature}`, "../x.1.y"]) {
      expect(readShareToken(bad, "secret", now)).toBeNull()
    }
  })

  it("lasts WISHLIST_SHARE_DAYS days, 30 by default", () => {
    expect(shareDays({})).toEqual(30)
    expect(shareDays({ WISHLIST_SHARE_DAYS: "7" })).toEqual(7)
    expect(shareDays({ WISHLIST_SHARE_DAYS: "0" })).toEqual(30)
    expect(shareDays({ WISHLIST_SHARE_DAYS: "abc" })).toEqual(30)
  })
})
