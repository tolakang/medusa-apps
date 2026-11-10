import "server-only"
import { cookies } from "next/headers"
import { seal, unseal } from "../session-seal"

// The signed-in seller's session (TASKS P5-08, as the POS app P2-10): the backend JWT, sealed in an
// httpOnly cookie (session-seal.ts). Eight hours; the backend's own
// token expiry still applies, and a 401 from the backend signs the seller out.

export const SESSION_COOKIE = "seller_session"
const MAX_AGE_SECONDS = 8 * 60 * 60

function secret(): string {
  const value = process.env.COOKIE_SECRET
  if (!value || value === "CHANGE_ME" || value.length < 16) {
    throw new Error("COOKIE_SECRET is not set (16+ characters). See .env.example.")
  }
  return value
}

export async function getToken(): Promise<string | null> {
  const jar = await cookies()
  return unseal(secret(), jar.get(SESSION_COOKIE)?.value)
}

export async function setToken(token: string): Promise<void> {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, seal(secret(), token), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function clearToken(): Promise<void> {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}
