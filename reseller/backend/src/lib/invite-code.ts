import { createHmac } from "node:crypto"
import { safeEqual } from "./safe-equal"

// Invite codes (docs/REVIEW_FIXES.md B11). An invited seller or cashier used
// to be claimed by whoever registered the invited email first, because these
// actors never prove they own the email. Now the admin gets a code with the
// invitation and gives it to the person; accepting needs the email AND the
// code.
//
// The code is derived from the record's id with a server secret (HMAC), so
// nothing is stored and it can be shown again in the admin API. It works once
// in practice: an invitation can only be linked to one sign-in.

// No 0/O, 1/I/L: the code is read out or typed by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 10

const secret = () => {
  const value =
    process.env.INVITE_CODE_SECRET ||
    process.env.COOKIE_SECRET ||
    process.env.JWT_SECRET
  if (value) {
    return value
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Set COOKIE_SECRET (or INVITE_CODE_SECRET) to issue invite codes.")
  }
  return "supersecret"
}

/** The invite code of one invitation, e.g. "K7QWP-3MZXA". */
export function inviteCode(kind: string, id: string): string {
  const digest = createHmac("sha256", secret())
    .update(`${kind}-invite:${id}`)
    .digest()
  let code = ""
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[digest[i] % ALPHABET.length]
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`
}

/** True when `given` is this invitation's code (case, spaces and dashes ignored). */
export function inviteCodeMatches(kind: string, id: string, given: unknown): boolean {
  if (typeof given !== "string") {
    return false
  }
  const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return safeEqual(clean(given), clean(inviteCode(kind, id)))
}
