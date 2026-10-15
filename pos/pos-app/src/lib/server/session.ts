import "server-only"
import { cookies } from "next/headers"
import { seal, unseal } from "../session-seal"

// The signed-in cashier's session (TASKS P2-10): the backend JWT, sealed in an
// httpOnly cookie (session-seal.ts). A shift is 8–12 hours; the backend's own
// token expiry still applies, and a 401 from the backend signs the till out.

export const SESSION_COOKIE = "pos_session"
const MAX_AGE_SECONDS = 12 * 60 * 60

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
