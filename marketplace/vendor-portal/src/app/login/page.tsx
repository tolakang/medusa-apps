"use client"

import { useActionState, useState } from "react"
import { login, signUp, type AuthState } from "./actions"

// Vendor sign-in and sign-up (TASKS P6-09). A new shop waits for the
// marketplace's approval before it can add products.

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login")
  // Controlled, so a wrong password doesn't empty the form.
  const [email, setEmail] = useState("")
  const [loginState, loginAction, loggingIn] = useActionState<AuthState, FormData>(login, {})
  const [signUpState, signUpAction, signingUp] = useActionState<AuthState, FormData>(signUp, {})
  const state = mode === "login" ? loginState : signUpState

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-2xl font-semibold">Vendor portal</h1>
        <p className="mt-1 text-ui-fg-subtle">
          {mode === "login" ? "Sign in to manage your shop." : "Open a shop on the marketplace. We review every new shop."}
        </p>

        <form action={mode === "login" ? loginAction : signUpAction} className="mt-6 flex flex-col gap-3">
          {mode === "signup" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Shop name</span>
                <input className="field" name="name" required maxLength={120} />
              </label>
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-sm font-medium">First name</span>
                  <input className="field" name="first_name" autoComplete="given-name" maxLength={80} />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-sm font-medium">Last name</span>
                  <input className="field" name="last_name" autoComplete="family-name" maxLength={80} />
                </label>
              </div>
            </>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Email</span>
            <input
              className="field"
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Password</span>
            <input
              className="field"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "signup" ? 8 : undefined}
              required
            />
          </label>
          {mode === "signup" && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Repeat password</span>
              <input className="field" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
            </label>
          )}

          {state.error && (
            <p role="alert" className="rounded-lg bg-ui-tag-red-bg px-3 py-2 text-sm text-ui-tag-red-text">
              {state.error}
            </p>
          )}
          {state.info && (
            <p className="rounded-lg bg-ui-tag-green-bg px-3 py-2 text-sm text-ui-tag-green-text">{state.info}</p>
          )}

          <button className="btn-primary mt-2" type="submit" disabled={loggingIn || signingUp}>
            {mode === "login" ? (loggingIn ? "Signing in…" : "Sign in") : signingUp ? "Creating your shop…" : "Create shop"}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-ui-fg-interactive"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "New vendor? Open a shop" : "Back to sign in"}
        </button>
      </div>
    </main>
  )
}
