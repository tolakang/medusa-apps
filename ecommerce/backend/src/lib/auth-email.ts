import { createHash } from "node:crypto"
import type { ConfigModule } from "@medusajs/framework/types"

// Account emails (TASKS P1-18): email verification and password reset, sent
// by the subscribers in src/subscribers/auth-*.ts through the email channel.
// Flows from the official guides: "Email Verification"
// (resources/commerce-modules/auth/email-verification), "Handle Password
// Reset Event" (resources/commerce-modules/auth/reset-password) and the
// storefront guides "Verify Customer Account" / "Reset Customer Password".

export const VERIFY_EMAIL_TEMPLATE = "auth-verify-email"
export const PASSWORD_RESET_TEMPLATE = "auth-password-reset"

export type AuthEmailData = { url: string; expires_minutes?: number }

// Links without a country code: the storefront middleware adds the visitor's
// country and keeps the query string (src/middleware.ts in the storefront).
export function storefrontLink(
  config: ConfigModule,
  page: "verify-account" | "reset-password",
  params: Record<string, string>
): string | null {
  const base = (config.admin.storefrontUrl ?? "").replace(/\/+$/, "")
  if (!/^https?:\/\//.test(base)) {
    return null
  }
  return `${base}/${page}?${new URLSearchParams(params)}`
}

// The admin dashboard's own reset page (`<admin>/reset-password`). The admin is
// served by this backend: admin.backendUrl when it is a full URL, otherwise the
// first ADMIN_CORS origin (the admin's origin in every deployment here).
export function adminLink(
  config: ConfigModule,
  params: Record<string, string>,
  adminCors: string | undefined = process.env.ADMIN_CORS
): string | null {
  const backendUrl = config.admin.backendUrl ?? ""
  const origin = /^https?:\/\//.test(backendUrl)
    ? backendUrl
    : (adminCors ?? "").split(",").map((o) => o.trim()).find((o) => /^https?:\/\//.test(o))
  if (!origin) {
    return null
  }
  const path = config.admin.path || "/app"
  return `${origin.replace(/\/+$/, "")}${path}/reset-password?${new URLSearchParams(params)}`
}

// Sender of account emails, e.g. "My Shop <verify@example.com>" (owner,
// 2026-10-06); empty = the order sender RESEND_FROM. Must be on a domain
// verified in Resend.
export function accountEmailFrom(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.RESEND_FROM_ACCOUNT?.trim() || undefined
}

// Idempotency key without the secret itself: a retried event sends one email,
// and the token never appears in the key.
export function authEmailKey(kind: string, secret: string): string {
  return `${kind}:${createHash("sha256").update(secret).digest("hex").slice(0, 32)}`
}
