import { createHmac } from "node:crypto"
import { safeEqual } from "./safe-equal"

// Share links for wishlists (TASKS P1-19). The official guide signs a JWT but
// reads it back with `decode`, which does not check the signature (anyone
// could forge a token for another wishlist). Here the token is
// "<wishlist id>.<expiry, unix seconds>.<HMAC-SHA256, base64url>" and the
// signature and expiry are always checked. Key: the project's JWT secret with
// its own label, so these tokens can't be used as anything else.
// Shared links last WISHLIST_SHARE_DAYS days (owner decision: 30).

export const DEFAULT_SHARE_DAYS = 30

export function shareDays(env: NodeJS.ProcessEnv = process.env): number {
  const days = Number(env.WISHLIST_SHARE_DAYS)
  return Number.isInteger(days) && days > 0 ? days : DEFAULT_SHARE_DAYS
}

function sign(payload: string, secret: string | Buffer): string {
  return createHmac("sha256", secret).update(`wishlist-share:${payload}`).digest("base64url")
}

export function createShareToken(
  wishlistId: string,
  secret: string | Buffer,
  now: number = Date.now(),
  days: number = shareDays()
): { token: string; expires_at: string } {
  const expires = Math.floor(now / 1000) + days * 24 * 60 * 60
  const payload = `${wishlistId}.${expires}`
  return {
    token: `${payload}.${sign(payload, secret)}`,
    expires_at: new Date(expires * 1000).toISOString(),
  }
}

// The wishlist ID, or null when the token is malformed, forged or expired.
export function readShareToken(token: string, secret: string | Buffer, now: number = Date.now()): string | null {
  const parts = token.split(".")
  if (parts.length !== 3 || !/^[A-Za-z0-9_]+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) {
    return null
  }
  const [wishlistId, expires, signature] = parts
  if (!safeEqual(signature, sign(`${wishlistId}.${expires}`, secret))) {
    return null
  }
  return Number(expires) * 1000 > now ? wishlistId : null
}
