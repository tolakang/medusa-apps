"use server"

import { redirect } from "next/navigation"
import { backendFetch, sdk } from "@/lib/server/medusa"
import { clearToken, setToken } from "@/lib/server/session"

// Seller sign-in and first-time setup (TASKS P5-08, as the POS app P2-10) over the backend's
// invite-only seller flow (P5-03): the shop invites the email, the seller
// sets a password here once (register + accept), then signs in.

export type AuthState = { error?: string; info?: string }

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim()

async function signIn(email: string, password: string): Promise<string | null> {
  try {
    const result = await sdk.auth.login("seller", "emailpass", { email, password })
    return typeof result === "string" ? result : null
  } catch {
    return null
  }
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const email = field(form, "email").toLowerCase()
  const password = String(form.get("password") ?? "")
  if (!email || !password) {
    return { error: "Enter your email and password." }
  }
  const token = await signIn(email, password)
  if (!token) {
    return { error: "Wrong email or password, or this account isn't a seller." }
  }
  // A token that isn't linked to a seller who isn't suspended can't use the portal.
  const me = await backendFetch<{ seller: { id: string } }>("/sellers/me", { token })
  if (!me.ok) {
    return { error: me.status === 401 ? "This seller account is suspended. Contact the shop." : me.message }
  }
  await setToken(token)
  redirect("/")
}

export async function setupAccount(_: AuthState, form: FormData): Promise<AuthState> {
  const email = field(form, "email").toLowerCase()
  const password = String(form.get("password") ?? "")
  if (!email || password.length < 8) {
    return { error: "Enter the invited email and a password of at least 8 characters." }
  }
  if (password !== String(form.get("confirm") ?? "")) {
    return { error: "The two passwords don't match." }
  }

  let registration: string
  try {
    registration = await sdk.auth.register("seller", "emailpass", { email, password })
  } catch (e) {
    const message = e instanceof Error ? e.message : ""
    return {
      error: /exist/i.test(message)
        ? "This email already has a password. Sign in instead."
        : message || "Couldn't create the account.",
    }
  }
  const accepted = await backendFetch("/sellers/accept", { token: registration, method: "POST", body: {} })
  if (!accepted.ok) {
    return { error: accepted.message }
  }
  const token = await signIn(email, password)
  if (!token) {
    return { info: "Your account is ready. Sign in with your new password." }
  }
  await setToken(token)
  redirect("/")
}

export async function logout(): Promise<void> {
  await clearToken()
  redirect("/login")
}
