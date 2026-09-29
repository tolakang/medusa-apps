// Optional Telegram contact at checkout (TASKS P1-16 step A): a username
// (5–32 letters, digits or _, with or without @) or a phone number. Saved in
// the cart's metadata; Medusa copies it to the order. The backend checks the
// same rule (ecommerce/backend/src/lib/telegram-contact.ts).

export const TELEGRAM_CONTACT_KEY = "telegram_contact"

const USERNAME_PATTERN = String.raw`@?[A-Za-z][A-Za-z0-9_]{4,31}`
const PHONE_PATTERN = String.raw`\+?[\(\) \-]*(?:[0-9][\(\) \-]*){8,15}`

export const telegramInputProps = {
  type: "text",
  autoComplete: "off",
  autoCapitalize: "none",
  spellCheck: false,
  pattern: `${USERNAME_PATTERN}|${PHONE_PATTERN}`,
  title:
    "A Telegram username like @nokor24, or the phone number you use on Telegram.",
} as const

// "@user" with a t.me link for usernames; the number as typed otherwise.
export function telegramContactLabel(
  value: unknown
): { text: string; url?: string } | null {
  if (typeof value !== "string" || !value.trim()) {
    return null
  }
  const v = value.trim()
  if (new RegExp(`^(?:${USERNAME_PATTERN})$`).test(v)) {
    const name = v.replace(/^@/, "")
    return { text: `@${name}`, url: `https://t.me/${name}` }
  }
  return { text: v }
}
