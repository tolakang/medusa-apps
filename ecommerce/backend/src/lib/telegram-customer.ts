import { createHmac, timingSafeEqual } from "node:crypto"

// Order updates to customers on Telegram (TASKS P1-17). Telegram bots cannot
// message a person first ("Bots can't start conversations with users. A user
// must either add them to a group or send them a message first.",
// core.telegram.org/bots), so the order page links to the customer bot with a
// deep link `https://t.me/<bot>?start=<payload>`; the bot receives
// "/start <payload>" (core.telegram.org/bots/features: payload up to 64
// characters of A-Z, a-z, 0-9, _ and -).
//
// The payload is the order ID plus a signature, so nobody can link a chat to
// someone else's order by guessing IDs: "<order id without order_>_<16-char
// HMAC-SHA256, base64url>" (26 + 1 + 16 = 43 characters).

export const TELEGRAM_CUSTOMER_CHANNEL = "telegram_customer"
export const TELEGRAM_WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token"

const ORDER_PREFIX = "order_"
const SIGNATURE_LENGTH = 16

export type TelegramCustomerConfig = {
  botUsername: string
  // Sent by Telegram in X-Telegram-Bot-Api-Secret-Token (setWebhook
  // secret_token, 1-256 of A-Z a-z 0-9 _ -) and used as the HMAC key.
  secret: string
}

// Null = the customer bot is not set up; the storefront hides the button.
export function telegramCustomerConfig(
  env: NodeJS.ProcessEnv = process.env
): TelegramCustomerConfig | null {
  const botUsername = env.TELEGRAM_CUSTOMER_BOT_USERNAME?.trim().replace(/^@/, "")
  const secret = env.TELEGRAM_CUSTOMER_WEBHOOK_SECRET?.trim()
  return botUsername && secret ? { botUsername, secret } : null
}

function sign(orderId: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`telegram-order-link:${orderId}`)
    .digest("base64url")
    .slice(0, SIGNATURE_LENGTH)
}

export function orderLinkPayload(orderId: string, secret: string): string {
  const id = orderId.startsWith(ORDER_PREFIX) ? orderId.slice(ORDER_PREFIX.length) : orderId
  return `${id}_${sign(orderId, secret)}`
}

// The order ID, or null when the payload is malformed or the signature is wrong.
export function parseOrderLinkPayload(payload: string, secret: string): string | null {
  const sig = payload.slice(-SIGNATURE_LENGTH)
  const id = payload.slice(0, -SIGNATURE_LENGTH - 1)
  if (!/^[A-Za-z0-9]+$/.test(id) || payload[payload.length - SIGNATURE_LENGTH - 1] !== "_") {
    return null
  }
  const orderId = `${ORDER_PREFIX}${id}`
  const expected = Buffer.from(sign(orderId, secret))
  const given = Buffer.from(sig)
  return given.length === expected.length && timingSafeEqual(given, expected) ? orderId : null
}

export function telegramStartUrl(orderId: string, config: TelegramCustomerConfig): string {
  return `https://t.me/${config.botUsername}?start=${orderLinkPayload(orderId, config.secret)}`
}

// "/start <payload>" → payload; "/start" alone → "" ; anything else → null.
export function startPayload(text: unknown): string | null {
  if (typeof text !== "string") {
    return null
  }
  const match = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/.exec(text.trim())
  return match ? match[1] ?? "" : null
}
