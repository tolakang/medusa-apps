import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

// The cashier's backend token is kept in an httpOnly cookie, sealed with
// AES-256-GCM under a key derived from COOKIE_SECRET (TASKS P2-10). The
// browser's scripts never see the token, and a copied cookie value is useless
// without the secret. Format: base64url(iv | tag | ciphertext).

const key = (secret: string) => createHash("sha256").update(`pos-app-session:${secret}`).digest()

export function seal(secret: string, value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv)
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url")
}

// Null for anything tampered with, sealed under another secret, or garbage.
export function unseal(secret: string, sealed: string | undefined | null): string | null {
  if (!sealed) {
    return null
  }
  try {
    const raw = Buffer.from(sealed, "base64url")
    if (raw.length < 29) {
      return null
    }
    const decipher = createDecipheriv("aes-256-gcm", key(secret), raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}
