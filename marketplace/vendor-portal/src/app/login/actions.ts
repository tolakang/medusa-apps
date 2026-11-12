"use server"

import { redirect } from "next/navigation"
import { backendFetch, sdk } from "@/lib/server/medusa"
import { clearToken, setToken } from "@/lib/server/session"

// Vendor sign-in and sign-up (TASKS P6-09) over the backend's vendor flow
// (P6-03, the official Vendors example): register, create the vendor with
// the registration token (POST /vendors), sign in. A new vendor waits for the
// marketplace's approval.

export type AuthState = { error?: string; info?: string }

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim()

async function signIn(email: string, password: string): Promise<string | null> {
  try {
    const result = await sdk.auth.login("vendor", "emailpass", { email, password })
    return typeof result === "string" ? result : null
  } catch {
    return null
  }
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  // Emailpass matches the email exactly as registered (MEDUSA_SKILL §7), and
  // sign-up below stores it lowercased, so sign in lowercased too.
  const email = field(form, "email").toLowerCase()
  const password = String(form.get("password") ?? "")
  if (!email || !password) {
    return { error: "Enter your email and password." }
  }
  const token = await signIn(email, password)
  if (!token) {
    return { error: "Wrong email or password, or this account isn't a vendor." }
  }
  const me = await backendFetch<{ vendor: { id: string } }>("/vendors/me", { token })
  if (!me.ok) {
    return { error: me.status === 401 ? "This vendor account is suspended. Contact the marketplace." : me.message }
  }
  await setToken(token)
  redirect("/")
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const email = field(form, "email").toLowerCase()
  const password = String(form.get("password") ?? "")
  const name = field(form, "name")
  if (!name) {
    return { error: "Enter your shop's name." }
  }
  if (!email || password.length < 8) {
    return { error: "Enter your email and a password of at least 8 characters." }
  }
  if (password !== String(form.get("confirm") ?? "")) {
    return { error: "The two passwords don't match." }
  }

  let registration: string | null
  try {
    registration = await sdk.auth.register("vendor", "emailpass", { email, password })
  } catch (e) {
    const message = e instanceof Error ? e.message : ""
    if (!/exist/i.test(message)) {
      return { error: message || "Couldn't create the account." }
    }
    // The password was set on an earlier try that stopped before the shop
    // was created: carry on with that password.
    registration = await signIn(email, password)
    if (!registration) {
      return { error: "This email already has a password. Sign in instead." }
    }
  }
  const created = await backendFetch("/vendors", {
    token: registration,
    method: "POST",
    body: {
      name,
      admin: { first_name: field(form, "first_name") || null, last_name: field(form, "last_name") || null },
    },
  })
  if (!created.ok) {
    return { error: created.message }
  }
  const token = await signIn(email, password)
  if (!token) {
    return { info: "Your shop is created. Sign in with your new password." }
  }
  await setToken(token)
  redirect("/")
}

export async function logout(): Promise<void> {
  await clearToken()
  redirect("/login")
}
