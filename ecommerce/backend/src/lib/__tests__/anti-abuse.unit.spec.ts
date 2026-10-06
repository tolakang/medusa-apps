import type { MedusaRequest } from "@medusajs/framework/http"
import { clientIp, TOO_MANY_ATTEMPTS_MESSAGE } from "../../api/auth-guards"
import { isAbandonedSignUp, retentionDays } from "../../workflows/cleanup-unverified-accounts"
import { FixedWindowLimiter } from "../rate-limit"

describe("FixedWindowLimiter (TASKS P1-21)", () => {
  it("allows the limit per window per key, then refuses until the window ends", () => {
    const limiter = new FixedWindowLimiter()
    const now = 1_000_000
    for (let i = 0; i < 3; i++) expect(limiter.hit("a", 3, 60_000, now).allowed).toBe(true)
    const blocked = limiter.hit("a", 3, 60_000, now + 1_000)
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 59 })
    expect(limiter.hit("b", 3, 60_000, now).allowed).toBe(true)
    expect(limiter.hit("a", 3, 60_000, now + 60_000).allowed).toBe(true)
  })

  it("words the wait for customers", () => {
    expect(TOO_MANY_ATTEMPTS_MESSAGE(30)).toEqual("Too many attempts. Please wait 30 seconds and try again.")
    expect(TOO_MANY_ATTEMPTS_MESSAGE(59)).toEqual("Too many attempts. Please wait 59 seconds and try again.")
    expect(TOO_MANY_ATTEMPTS_MESSAGE(60)).toEqual("Too many attempts. Please wait 1 minute and try again.")
    expect(TOO_MANY_ATTEMPTS_MESSAGE(150)).toEqual("Too many attempts. Please wait 3 minutes and try again.")
  })
})

describe("clientIp", () => {
  const req = (headers: Record<string, string>, ip = "10.0.0.9") =>
    ({ headers, ip, socket: { remoteAddress: "10.0.0.1" } }) as unknown as MedusaRequest

  it("uses req.ip (Medusa trusts one proxy), or the configured header first", () => {
    expect(clientIp(req({}), {})).toEqual("10.0.0.9")
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.5" }), {})).toEqual("10.0.0.9")
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.5" }), { CLIENT_IP_HEADER: "CF-Connecting-IP" })).toEqual(
      "203.0.113.5"
    )
    expect(clientIp(req({ "x-real": "1.1.1.1, 2.2.2.2" }), { CLIENT_IP_HEADER: "x-real" })).toEqual("1.1.1.1")
  })
})

describe("cleanup of never-verified sign-ups", () => {
  const base = { id: "authid_1", provider_identities: [{ provider: "emailpass" }], verifications: [] }

  it("removes only unused, unverified email sign-ups", () => {
    expect(isAbandonedSignUp(base)).toBe(true)
    expect(isAbandonedSignUp({ ...base, app_metadata: {} })).toBe(true)
    expect(isAbandonedSignUp({ ...base, app_metadata: { customer_id: "cus_1" } })).toBe(false)
    expect(isAbandonedSignUp({ ...base, app_metadata: { user_id: "user_1" } })).toBe(false)
    expect(isAbandonedSignUp({ ...base, verifications: [{ verified_at: new Date() }] })).toBe(false)
    expect(isAbandonedSignUp({ ...base, provider_identities: [{ provider: "google" }] })).toBe(false)
    expect(isAbandonedSignUp({ ...base, provider_identities: [] })).toBe(false)
  })

  it("keeps sign-ups 28 days by default", () => {
    expect(retentionDays({})).toEqual(28)
    expect(retentionDays({ UNVERIFIED_ACCOUNT_RETENTION_DAYS: "7" })).toEqual(7)
    expect(retentionDays({ UNVERIFIED_ACCOUNT_RETENTION_DAYS: "-1" })).toEqual(28)
  })
})
