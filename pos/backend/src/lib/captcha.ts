import { MedusaError } from "@medusajs/framework/utils"

// CAPTCHA on customer sign-in, sign-up and forgot password (owner,
// 2026-10-06; TASKS P1-21). Checked by the backend (bots can call Medusa's
// API directly), one provider chosen in Dokploy:
// - "recaptcha": Google reCAPTCHA in Google Cloud ("Fraud Defense"), the
//   current version: score-based key, browser `enterprise.js` +
//   `grecaptcha.enterprise.execute(key, { action })`, backend CreateAssessment
//   (docs.cloud.google.com/recaptcha/docs/create-assessment-website). Not the
//   legacy SiteVerify, which Google keeps only for old integrations.
//   10,000 assessments a month are free; beyond that billing must be enabled,
//   otherwise assessments fail and sign-ins are refused.
// - "turnstile": Cloudflare Turnstile, Siteverify
//   (developers.cloudflare.com/turnstile/get-started/server-side-validation).
// Empty CAPTCHA_PROVIDER = off (development, tests). Tokens are single-use
// (Google: 2 minutes, Turnstile: 5 minutes).

export const RECAPTCHA_ASSESSMENT_URL = "https://recaptchaenterprise.googleapis.com/v1/projects"
export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
export const DEFAULT_MIN_SCORE = 0.5

export type CaptchaAction = "login" | "signup" | "password_reset"

export type CaptchaConfig =
  | { provider: "turnstile"; secret: string }
  | { provider: "recaptcha"; projectId: string; apiKey: string; siteKey: string; minScore: number }

// Null = CAPTCHA off. A provider with missing keys throws, so a half-set-up
// shop fails loudly at start instead of silently skipping the check.
export function captchaConfig(env: NodeJS.ProcessEnv = process.env): CaptchaConfig | null {
  const provider = env.CAPTCHA_PROVIDER?.trim().toLowerCase()
  if (!provider) {
    return null
  }
  if (provider === "turnstile") {
    const secret = env.CAPTCHA_SECRET_KEY?.trim()
    if (!secret) throw new MedusaError(MedusaError.Types.INVALID_ARGUMENT, "CAPTCHA_PROVIDER=turnstile needs CAPTCHA_SECRET_KEY.")
    return { provider, secret }
  }
  if (provider === "recaptcha") {
    const projectId = env.RECAPTCHA_PROJECT_ID?.trim()
    const apiKey = env.RECAPTCHA_API_KEY?.trim()
    const siteKey = env.RECAPTCHA_SITE_KEY?.trim()
    if (!projectId || !apiKey || !siteKey) {
      throw new MedusaError(MedusaError.Types.INVALID_ARGUMENT, 
        "CAPTCHA_PROVIDER=recaptcha needs RECAPTCHA_PROJECT_ID, RECAPTCHA_API_KEY and RECAPTCHA_SITE_KEY."
      )
    }
    const minScore = Number(env.RECAPTCHA_MIN_SCORE)
    return {
      provider,
      projectId,
      apiKey,
      siteKey,
      minScore: Number.isFinite(minScore) && minScore >= 0 && minScore <= 1 ? minScore : DEFAULT_MIN_SCORE,
    }
  }
  throw new MedusaError(MedusaError.Types.INVALID_ARGUMENT, `Unknown CAPTCHA_PROVIDER "${provider}" (use recaptcha or turnstile).`)
}

export type CaptchaResult = { ok: true } | { ok: false; reason: string }

export async function verifyCaptcha(
  config: CaptchaConfig,
  token: string,
  action: CaptchaAction,
  fetchImpl: typeof fetch = fetch
): Promise<CaptchaResult> {
  if (!token || token.length > 4096) {
    return { ok: false, reason: "missing token" }
  }
  try {
    if (config.provider === "turnstile") {
      const response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: config.secret, response: token }),
        signal: AbortSignal.timeout(10_000),
      })
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean
        "error-codes"?: string[]
      }
      return body.success === true
        ? { ok: true }
        : { ok: false, reason: (body["error-codes"] ?? []).join(",") || `status ${response.status}` }
    }

    const url = `${RECAPTCHA_ASSESSMENT_URL}/${encodeURIComponent(config.projectId)}/assessments?key=${encodeURIComponent(config.apiKey)}`
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: { token, siteKey: config.siteKey, expectedAction: action } }),
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await response.json().catch(() => ({}))) as {
      tokenProperties?: { valid?: boolean; action?: string; invalidReason?: string }
      riskAnalysis?: { score?: number }
      error?: { message?: string }
    }
    if (!response.ok) {
      return { ok: false, reason: body.error?.message ?? `status ${response.status}` }
    }
    if (!body.tokenProperties?.valid) {
      return { ok: false, reason: body.tokenProperties?.invalidReason ?? "invalid token" }
    }
    // The action must match, or the token was made for another form.
    if (body.tokenProperties.action !== action) {
      return { ok: false, reason: `action ${body.tokenProperties.action}` }
    }
    const score = body.riskAnalysis?.score ?? 0
    return score >= config.minScore ? { ok: true } : { ok: false, reason: `score ${score}` }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}
