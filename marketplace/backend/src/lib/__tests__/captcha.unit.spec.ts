import { captchaConfig, verifyCaptcha, type CaptchaConfig } from "../captcha"

// CAPTCHA providers (TASKS P1-21). Fetch is faked: nothing reaches Google or
// Cloudflare.
const reply = (status: number, body: object) =>
  jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })

describe("captchaConfig", () => {
  it("is off when no provider is set, and refuses half-set-up providers", () => {
    expect(captchaConfig({})).toBeNull()
    expect(captchaConfig({ CAPTCHA_PROVIDER: "turnstile", CAPTCHA_SECRET_KEY: "s" })).toEqual({
      provider: "turnstile",
      secret: "s",
    })
    expect(() => captchaConfig({ CAPTCHA_PROVIDER: "turnstile" })).toThrow("CAPTCHA_SECRET_KEY")
    expect(() => captchaConfig({ CAPTCHA_PROVIDER: "recaptcha", RECAPTCHA_PROJECT_ID: "p" })).toThrow(
      "RECAPTCHA_API_KEY"
    )
    expect(() => captchaConfig({ CAPTCHA_PROVIDER: "hcaptcha" })).toThrow("Unknown")
    expect(
      captchaConfig({
        CAPTCHA_PROVIDER: "reCAPTCHA",
        RECAPTCHA_PROJECT_ID: "p",
        RECAPTCHA_API_KEY: "k",
        RECAPTCHA_SITE_KEY: "site",
        RECAPTCHA_MIN_SCORE: "0.7",
      })
    ).toEqual({ provider: "recaptcha", projectId: "p", apiKey: "k", siteKey: "site", minScore: 0.7 })
  })
})

describe("verifyCaptcha: Google reCAPTCHA (CreateAssessment)", () => {
  const config: CaptchaConfig = {
    provider: "recaptcha",
    projectId: "shop-project",
    apiKey: "api-key",
    siteKey: "site-key",
    minScore: 0.5,
  }
  const assessment = (valid: boolean, action: string, score: number) =>
    reply(200, { tokenProperties: { valid, action, invalidReason: valid ? undefined : "EXPIRED" }, riskAnalysis: { score } })

  it("accepts a valid token for the same action with a good score", async () => {
    const fetchMock = assessment(true, "login", 0.9)
    expect(await verifyCaptcha(config, "token", "login", fetchMock)).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toEqual(
      "https://recaptchaenterprise.googleapis.com/v1/projects/shop-project/assessments?key=api-key"
    )
    expect(JSON.parse(init.body)).toEqual({
      event: { token: "token", siteKey: "site-key", expectedAction: "login" },
    })
  })

  it("refuses invalid tokens, another form's action, low scores and Google errors", async () => {
    expect((await verifyCaptcha(config, "t", "login", assessment(false, "login", 0.9))).ok).toBe(false)
    expect((await verifyCaptcha(config, "t", "login", assessment(true, "signup", 0.9))).ok).toBe(false)
    expect((await verifyCaptcha(config, "t", "login", assessment(true, "login", 0.3))).ok).toBe(false)
    expect(
      (await verifyCaptcha(config, "t", "login", reply(429, { error: { message: "Quota exceeded" } }))).ok
    ).toBe(false)
    expect((await verifyCaptcha(config, "t", "login", jest.fn().mockRejectedValue(new Error("down")))).ok).toBe(false)
  })

  it("refuses a missing token without calling Google", async () => {
    const fetchMock = assessment(true, "login", 0.9)
    expect((await verifyCaptcha(config, "", "login", fetchMock)).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("verifyCaptcha: Cloudflare Turnstile (Siteverify)", () => {
  const config: CaptchaConfig = { provider: "turnstile", secret: "secret" }

  it("posts secret and token, and follows success", async () => {
    const ok = reply(200, { success: true })
    expect(await verifyCaptcha(config, "token", "signup", ok)).toEqual({ ok: true })
    const [url, init] = ok.mock.calls[0]
    expect(url).toEqual("https://challenges.cloudflare.com/turnstile/v0/siteverify")
    expect(String(init.body)).toEqual("secret=secret&response=token")
    const spent = reply(200, { success: false, "error-codes": ["timeout-or-duplicate"] })
    expect(await verifyCaptcha(config, "token", "signup", spent)).toEqual({
      ok: false,
      reason: "timeout-or-duplicate",
    })
  })
})
