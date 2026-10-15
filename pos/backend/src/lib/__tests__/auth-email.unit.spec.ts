import type { ConfigModule } from "@medusajs/framework/types"
import {
  accountEmailFrom,
  adminLink,
  authEmailKey,
  PASSWORD_RESET_TEMPLATE,
  storefrontLink,
  VERIFY_EMAIL_TEMPLATE,
} from "../auth-email"
import { renderEmail } from "../../modules/resend/templates"

const config = (admin: Record<string, unknown>) => ({ admin }) as unknown as ConfigModule

describe("account email links (TASKS P1-18)", () => {
  it("builds storefront links without a country code, with encoded parameters", () => {
    expect(
      storefrontLink(config({ storefrontUrl: "https://shop.example.com/" }), "reset-password", {
        token: "a+b/c",
        email: "a+b@example.com",
      })
    ).toEqual("https://shop.example.com/reset-password?token=a%2Bb%2Fc&email=a%2Bb%40example.com")
    expect(storefrontLink(config({}), "verify-account", { token: "t" })).toBeNull()
  })

  it("uses the admin's backend URL, else the first ADMIN_CORS origin", () => {
    expect(adminLink(config({ backendUrl: "https://api.example.com", path: "/app" }), { token: "t" })).toEqual(
      "https://api.example.com/app/reset-password?token=t"
    )
    expect(adminLink(config({ backendUrl: "/" }), { token: "t" }, " https://api.example.com , https://x.example")).toEqual(
      "https://api.example.com/app/reset-password?token=t"
    )
    expect(adminLink(config({}), { token: "t" }, "")).toBeNull()
  })

  it("sends account emails from RESEND_FROM_ACCOUNT, else the default sender", () => {
    expect(accountEmailFrom({ RESEND_FROM_ACCOUNT: " Shop <verify@example.com> " })).toEqual(
      "Shop <verify@example.com>"
    )
    expect(accountEmailFrom({ RESEND_FROM_ACCOUNT: "" })).toBeUndefined()
    expect(accountEmailFrom({})).toBeUndefined()
  })

  it("keeps the token out of the idempotency key", () => {
    const key = authEmailKey("password-reset", "secret-token")
    expect(key).toMatch(/^password-reset:[0-9a-f]{32}$/)
    expect(key).not.toContain("secret-token")
  })

  it("renders both emails with the link escaped", () => {
    const url = "https://shop.example.com/verify-account?token=x&email=a@example.com"
    const verify = renderEmail(VERIFY_EMAIL_TEMPLATE, { url, expires_minutes: 60 })
    expect(verify?.subject).toEqual("Confirm your email")
    expect(verify?.html).toContain("token=x&amp;email=a@example.com")
    expect(verify?.html).toContain("expires in 60 minutes")
    const reset = renderEmail(PASSWORD_RESET_TEMPLATE, { url: "https://shop.example.com/reset-password?token=y" })
    expect(reset?.subject).toEqual("Reset your password")
    expect(renderEmail(PASSWORD_RESET_TEMPLATE, {})).toBeNull()
  })
})
