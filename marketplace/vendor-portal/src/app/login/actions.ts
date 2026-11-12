"use server"

import { redirect } from "next/navigation"
import { backendFetch, sdk } from "@/lib/server/medusa"
import { clearToken, setToken } from "@/lib/server/session"

// Vendor sign-in and sign-up (TASKS P6-09) over the backend's vendor flow
// (P6-03, the official Vendors example): register, create the vendor with
// the registration token (POST /vendors), sign in. A new vendor waits for the
// marketplace's approval. Vendors confirm their email before they can sign
// in (review 2, A3): the backend answers `verification_required`, the portal
// asks for the email (metadata actor "vendor", so the link opens this
// portal's /verify-account page) and says so.

export type AuthState = { error?: string; info?: string }

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim()

type SignIn = { token: string } | { verify: string } | null

async function signIn(email: string, password: string): Promise<SignIn> {
  try {
    const result = await sdk.auth.login("vendor", "emailpass", { email, password })
    if (typeof result === "string") {
      return { token: result }
    }
    if (
      result &&
      typeof result === "object" &&
      "verification_required" in result &&
      result.verification_required &&
      typeof result.token === "string"
    ) {
      return { verify: result.token }
    }
    return null
  } catch {
    return null
  }
}

// Sends the "confirm your email" link (the backend allows one per address
// every 2 minutes).
async function askToVerify(email: string, token: string): Promise<AuthState> {
  try {
    await sdk.auth.verification.request(
      { entity_id: email, entity_type: "email", metadata: { actor: "vendor" } },
      { authorization: `Bearer ${token}` }
    )
    return { info: `We emailed a link to ${email}. Open it to confirm your email, then sign in.` }
  } catch (e) {
    const status = (e as { status?: number })?.status
    return status === 429
      ? { info: `We already emailed a link to ${email}. Open it to confirm your email, then sign in.` }
      : { error: "Couldn't send the confirmation email. Try again in a few minutes." }
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
  const signedIn = await signIn(email, password)
  if (!signedIn) {
    return { error: "Wrong email or password, or this account isn't a vendor." }
  }
  if ("verify" in signedIn) {
    return askToVerify(email, signedIn.verify)
  }
  const token = signedIn.token
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
    const again = await signIn(email, password)
    if (!again) {
      return { error: "This email already has a password. Sign in instead." }
    }
    registration = "token" in again ? again.token : again.verify
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
  const signedIn = await signIn(email, password)
  if (signedIn && "token" in signedIn) {
    await setToken(signedIn.token)
    redirect("/")
  }
  // New vendors confirm their email first (review 2, A3).
  return askToVerify(email, signedIn && "verify" in signedIn ? signedIn.verify : registration)
}

// The emailed link's code (POST /auth/verification/confirm needs no sign-in).
export async function confirmEmail(code: string): Promise<boolean> {
  try {
    await sdk.auth.verification.confirm({ code })
    return true
  } catch {
    return false
  }
}

export async function logout(): Promise<void> {
  await clearToken()
  redirect("/login")
}
