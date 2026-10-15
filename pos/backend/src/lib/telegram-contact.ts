import { isValidPhone } from "./phone"

// Optional Telegram contact a customer gives at checkout (owner, 2026-09-29,
// TASKS P1-16 step A). Saved in the cart's metadata, which Medusa copies to the
// order (core-flows complete-cart: `metadata: cart.metadata`). Staff use it to
// message the customer themselves; the bot cannot write first (P1-17).
// Accepted: a Telegram username (5–32 letters, digits or _, with or without @)
// or a phone number (same rule as src/lib/phone.ts). Keep in step with the
// storefront's src/lib/util/telegram-contact.ts.

export const TELEGRAM_CONTACT_KEY = "telegram_contact"

export const TELEGRAM_CONTACT_MESSAGE =
  "Telegram: enter a username like @your_username (5–32 letters, digits or _) or a phone number."

const USERNAME = /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/

export function isValidTelegramContact(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return true
  }
  if (typeof value !== "string") {
    return false
  }
  const v = value.trim()
  return USERNAME.test(v) || (/\d/.test(v) && isValidPhone(v))
}

// "@user" with a t.me link for usernames; the number as typed otherwise.
export function telegramContactLabel(value: unknown): { text: string; url?: string } | null {
  if (typeof value !== "string" || !value.trim() || !isValidTelegramContact(value)) {
    return null
  }
  const v = value.trim()
  if (USERNAME.test(v)) {
    const name = v.replace(/^@/, "")
    return { text: `@${name}`, url: `https://t.me/${name}` }
  }
  return { text: v }
}
