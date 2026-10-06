import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { captchaConfig, verifyCaptcha, type CaptchaAction } from "../lib/captcha"
import { FixedWindowLimiter } from "../lib/rate-limit"
import { MIN_PASSWORD_LENGTH } from "./store/customers/me/password/validators"

// Checks in front of Medusa's own auth routes (owner, 2026-10-06; registered
// in middlewares.ts, which runs project middlewares after the core ones).

export const PASSWORD_TOO_SHORT_MESSAGE = `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`

// Customer sign-up and password reset (`/auth/customer/emailpass/register`,
// `/auth/customer/emailpass/update`): Medusa sets no minimum length.
export function requireStrongPassword(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const password = (req.body as { password?: unknown } | undefined)?.password
  if (typeof password === "string" && password.length < MIN_PASSWORD_LENGTH) {
    return next(new MedusaError(MedusaError.Types.INVALID_DATA, PASSWORD_TOO_SHORT_MESSAGE))
  }
  next()
}

// At most one verification email per address per RESEND_WINDOW_SECONDS
// (`POST /auth/verification/request`). Every sign-in of an unverified account
// asks for one, so without this repeated tries flood the inbox. Uses the Auth
// Module's own record of requests (`listAuthVerifications`, `requested_at`).
export const RESEND_WINDOW_SECONDS = 120
export const RESEND_TOO_SOON_MESSAGE =
  "We just sent a verification link to this email. Check your inbox and spam folder, or try again in 2 minutes."

export async function limitVerificationEmails(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const body = (req.body ?? {}) as { entity_id?: unknown; entity_type?: unknown }
  if (body.entity_type !== "email" || typeof body.entity_id !== "string") {
    return next()
  }
  try {
    const auth = req.scope.resolve(Modules.AUTH)
    const [latest] = await auth.listAuthVerifications(
      { entity_id: body.entity_id },
      { order: { requested_at: "DESC" }, take: 1 }
    )
    const last = latest?.requested_at ? new Date(latest.requested_at).getTime() : 0
    if (Date.now() - last < RESEND_WINDOW_SECONDS * 1000) {
      return res.status(429).json({ type: "too_many_requests", message: RESEND_TOO_SOON_MESSAGE })
    }
  } catch (e) {
    return next(e)
  }
  next()
}

// CAPTCHA (owner, 2026-10-06; TASKS P1-21) on customer sign-in, sign-up and
// forgot password. The storefront sends the token in the
// `x-captcha-token` header or as `captcha_token` in the body. Off when
// CAPTCHA_PROVIDER is empty (src/lib/captcha.ts).
export const CAPTCHA_FAILED_MESSAGE =
  "Please complete the security check and try again."

export function requireCaptcha(action: CaptchaAction) {
  return async function captchaMiddleware(
    req: MedusaRequest,
    _res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    let config
    try {
      config = captchaConfig()
    } catch (e) {
      return next(e)
    }
    if (!config) {
      return next()
    }
    const header = req.headers["x-captcha-token"]
    const body = (req.body ?? {}) as { captcha_token?: unknown }
    const token =
      (typeof header === "string" && header) ||
      (typeof body.captcha_token === "string" ? body.captcha_token : "")
    const result = await verifyCaptcha(config, token, action)
    if (!result.ok) {
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .info(`CAPTCHA refused (${action}): ${result.reason}`)
      return next(new MedusaError(MedusaError.Types.INVALID_DATA, CAPTCHA_FAILED_MESSAGE))
    }
    next()
  }
}

// Per-IP limits on customer auth (TASKS P1-21): slows password guessing,
// mass sign-ups and email bombing. The client IP is `req.ip` (Medusa sets
// Express `trust proxy` to 1, so behind Traefik this is the visitor), or the
// header named in CLIENT_IP_HEADER when another proxy sits in front (e.g.
// `cf-connecting-ip` behind Cloudflare). 429 with Retry-After.
const limiter = new FixedWindowLimiter()

export const TOO_MANY_ATTEMPTS_MESSAGE = (seconds: number) =>
  `Too many attempts. Please wait ${seconds >= 60 ? `${Math.ceil(seconds / 60)} minute${seconds >= 120 ? "s" : ""}` : `${seconds} seconds`} and try again.`

export function clientIp(req: MedusaRequest, env: NodeJS.ProcessEnv = process.env): string {
  const headerName = env.CLIENT_IP_HEADER?.trim().toLowerCase()
  const header = headerName ? req.headers[headerName] : undefined
  const fromHeader = (Array.isArray(header) ? header[0] : header)?.split(",")[0]?.trim()
  return fromHeader || req.ip || req.socket?.remoteAddress || "unknown"
}

export function limitPerIp(name: string, limit: number, windowSeconds: number) {
  return function perIpLimit(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
    const { allowed, retryAfterSeconds } = limiter.hit(
      `${name}:${clientIp(req)}`,
      limit,
      windowSeconds * 1000
    )
    if (!allowed) {
      res.setHeader("Retry-After", String(retryAfterSeconds))
      return res
        .status(429)
        .json({ type: "too_many_requests", message: TOO_MANY_ATTEMPTS_MESSAGE(retryAfterSeconds) })
    }
    next()
  }
}

// Requests per IP per minute (generous for people, slow for scripts).
export const AUTH_LIMITS = {
  login: 20,
  signup: 10,
  password_reset: 10,
  verification: 10,
  password_change: 10,
} as const
