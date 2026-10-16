"use client"

import { useCallback, useEffect, useRef } from "react"

// CAPTCHA for the sign-in, sign-up and forgot-password forms (TASKS P1-21).
// The backend checks the token (src/api/auth-guards.ts there); this only gets
// one per submit. Provider from NEXT_PUBLIC_CAPTCHA_PROVIDER (build arg):
// - "recaptcha": Google reCAPTCHA in Google Cloud, score-based key: no widget,
//   `enterprise.js?render=<key>` and `grecaptcha.enterprise.execute(key,
//   { action })` at submit (docs.cloud.google.com/recaptcha/docs/instrument-web-pages).
// - "turnstile": Cloudflare Turnstile widget, explicit rendering
//   (`api.js?render=explicit`, `turnstile.render/getResponse/reset`).
// Empty = off: getToken() returns "".

export type CaptchaAction = "login" | "signup" | "password_reset"

const PROVIDER = process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER?.trim().toLowerCase() ?? ""
const SITE_KEY = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY?.trim() ?? ""
export const CAPTCHA_ENABLED = !!SITE_KEY && (PROVIDER === "recaptcha" || PROVIDER === "turnstile")

type Grecaptcha = {
  enterprise: {
    ready: (cb: () => void) => void
    execute: (key: string, options: { action: string }) => Promise<string>
  }
}
type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  getResponse: (id: string) => string | undefined
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window {
    grecaptcha?: Grecaptcha
    turnstile?: Turnstile
  }
}

const SCRIPTS: Record<string, string> = {
  recaptcha: `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(SITE_KEY)}`,
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
}

let scriptPromise: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.src = SCRIPTS[PROVIDER]
      script.async = true
      const fail = () => {
        scriptPromise = null
        script.remove()
        reject(new Error("The security check could not load. Check your connection and try again."))
      }
      // A blocked or very slow script must not hang the form.
      const timer = setTimeout(fail, 10_000)
      script.onload = () => {
        clearTimeout(timer)
        resolve()
      }
      script.onerror = () => {
        clearTimeout(timer)
        fail()
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Returns the widget to place in the form (Turnstile; null otherwise) and
// getToken() to call right before each submit.
export function useCaptcha(action: CaptchaAction) {
  const widgetId = useRef<string | null>(null)

  // Google: load the script early so the first submit is fast.
  useEffect(() => {
    if (CAPTCHA_ENABLED && PROVIDER === "recaptcha") loadScript().catch(() => undefined)
  }, [])

  // Turnstile: draw the widget whenever its box appears (the form can be
  // replaced by another screen and come back) and remove it when it goes.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) {
        if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
        widgetId.current = null
        return
      }
      loadScript()
        .then(async () => {
          for (let i = 0; i < 50 && !window.turnstile; i++) await wait(100)
          if (!element.isConnected || !window.turnstile) return
          if (widgetId.current) window.turnstile.remove(widgetId.current)
          widgetId.current = window.turnstile.render(element, { sitekey: SITE_KEY, action })
        })
        .catch(() => undefined)
    },
    [action]
  )

  const getToken = useCallback(async (): Promise<string> => {
    if (!CAPTCHA_ENABLED) return ""
    await loadScript()
    if (PROVIDER === "recaptcha") {
      for (let i = 0; i < 50 && !window.grecaptcha?.enterprise; i++) await wait(100)
      const grecaptcha = window.grecaptcha
      if (!grecaptcha?.enterprise) return ""
      await new Promise<void>((resolve) => grecaptcha.enterprise.ready(resolve))
      return grecaptcha.enterprise.execute(SITE_KEY, { action })
    }
    // Turnstile: the widget's current token (waits briefly if it is still
    // solving), then a fresh widget for the next try (tokens are single-use).
    let token = ""
    for (let i = 0; i < 50; i++) {
      token = widgetId.current ? window.turnstile?.getResponse(widgetId.current) ?? "" : ""
      if (token) break
      await wait(100)
    }
    if (widgetId.current) window.turnstile?.reset(widgetId.current)
    return token
  }, [action])

  const widget = CAPTCHA_ENABLED && PROVIDER === "turnstile" ? (
    <div ref={container} className="mt-4 flex justify-center" data-testid="captcha-widget" />
  ) : CAPTCHA_ENABLED ? (
    <p className="mt-4 text-[11px] text-ui-fg-muted text-center" data-testid="captcha-notice">
      Protected by reCAPTCHA. Google&apos;s{" "}
      <a href="https://policies.google.com/privacy" className="underline" target="_blank" rel="noreferrer">
        Privacy Policy
      </a>{" "}
      and{" "}
      <a href="https://policies.google.com/terms" className="underline" target="_blank" rel="noreferrer">
        Terms
      </a>{" "}
      apply.
    </p>
  ) : null

  return { widget, getToken }
}
