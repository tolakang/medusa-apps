import { timingSafeEqual } from "node:crypto"

// Compares a secret or signature from a request with the expected value in
// constant time (node:crypto timingSafeEqual), so the comparison's duration
// gives nothing away. Used for PayWay callback signatures, the Telegram
// webhook secret and signed Telegram order links.
export function safeEqual(given: unknown, expected: string): boolean {
  if (typeof given !== "string") {
    return false
  }
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
