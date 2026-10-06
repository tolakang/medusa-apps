import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { createHmac } from "node:crypto"

// Two-factor sign-in for admins (TASKS P1-22) through Medusa's real MFA
// routes, with the Auth Module configured in medusa-config.ts. TOTP codes are
// computed here (RFC 6238: SHA-1, 30 s, 6 digits), as an authenticator app
// would.
process.env.AUTH_MFA_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
jest.setTimeout(120 * 1000)

const EMAIL = "owner@example.com"
const PASSWORD = "Admin-Test-Pass-1"

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  let bits = ""
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0")
  }
  const bytes = bits.match(/.{8}/g) ?? []
  return Buffer.from(bytes.map((b) => parseInt(b, 2)))
}

function totp(secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)))
  const hash = createHmac("sha1", base32Decode(secret)).update(counter).digest()
  const offset = hash[hash.length - 1] & 0xf
  const code = (hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(code).padStart(6, "0")
}

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Admin two-factor sign-in (TASKS P1-22)", () => {
      const call = (method: "post" | "delete", path: string, body?: object, token?: string) =>
        (method === "post"
          ? api.post(path, body ?? {}, { headers: token ? { authorization: `Bearer ${token}` } : {} })
          : api.delete(path, { headers: token ? { authorization: `Bearer ${token}` } : {} })
        )
          .then((r) => ({ status: r.status, data: r.data }))
          .catch((e) => ({ status: e.response.status, data: e.response.data }))

      it("enrolls an authenticator, then asks for a code at every sign-in", async () => {
        const container = getContainer()
        const user = await container.resolve(Modules.USER).createUsers({ email: EMAIL })
        const identity = await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: EMAIL }],
          app_metadata: { user_id: user.id },
        })
        await container
          .resolve(Modules.AUTH)
          .updateProvider("emailpass", { entity_id: EMAIL, password: PASSWORD })
        expect(identity.id).toBeTruthy()

        // Before 2FA: email + password gives a token.
        const first = await call("post", "/auth/user/emailpass", { email: EMAIL, password: PASSWORD })
        expect(typeof first.data.token).toEqual("string")

        // Enroll (what the admin's Settings → Profile → Two-factor does).
        const enroll = await call(
          "post",
          "/auth/mfa/factors",
          { provider: "totp", label: EMAIL, issuer: "E-Shop" },
          first.data.token
        )
        expect(enroll.status).toBeLessThan(300)
        expect(enroll.data.otpauth_url).toMatch(/^otpauth:\/\/totp\//)
        const factorId = enroll.data.mfa_factor.id
        const wrongSetup = await call("post", `/auth/mfa/factors/${factorId}/verify`, { code: "000000" }, first.data.token)
        expect(wrongSetup.status).toBeGreaterThanOrEqual(400)
        const verified = await call(
          "post",
          `/auth/mfa/factors/${factorId}/verify`,
          { code: totp(enroll.data.secret) },
          first.data.token
        )
        expect(verified.status).toBeLessThan(300)

        const codes = await call("post", "/auth/mfa/recovery-codes", { count: 2 }, first.data.token)
        expect(codes.data.recovery_codes).toHaveLength(2)

        // After 2FA: email + password alone gives a challenge and a limited
        // token that the admin API refuses until the code is given.
        const challenged = await call("post", "/auth/user/emailpass", { email: EMAIL, password: PASSWORD })
        const challenge = challenged.data.mfa_challenge
        const limited = await api
          .get("/admin/users/me", { headers: { authorization: `Bearer ${challenged.data.token}` } })
          .then((r) => r.status)
          .catch((e) => e.response.status)
        expect(limited).toEqual(401)
        expect(challenge.methods).toEqual(expect.arrayContaining(["totp", "recovery_code"]))
        // The challenge is answered with the limited token (as the dashboard does).
        const wrong = await call(
          "post",
          `/auth/mfa/challenges/${challenge.id}/verify`,
          { method: "totp", code: "000000" },
          challenged.data.token
        )
        expect(wrong.status).toBeGreaterThanOrEqual(400)
        expect(wrong.status).not.toEqual(401)
        const passed = await call(
          "post",
          `/auth/mfa/challenges/${challenge.id}/verify`,
          { method: "totp", code: totp(enroll.data.secret) },
          challenged.data.token
        )
        expect(typeof passed.data.token).toEqual("string")
        const full = await api.get("/admin/users/me", { headers: { authorization: `Bearer ${passed.data.token}` } })
        expect(full.data.user.email).toEqual(EMAIL)

        // A recovery code also works (once).
        const again = await call("post", "/auth/user/emailpass", { email: EMAIL, password: PASSWORD })
        const recovered = await call(
          "post",
          `/auth/mfa/challenges/${again.data.mfa_challenge.id}/verify`,
          { method: "recovery_code", code: codes.data.recovery_codes[0] },
          again.data.token
        )
        expect(typeof recovered.data.token).toEqual("string")

        // disable_policy "challenge": a session alone can't switch 2FA off.
        const disable = await call("delete", `/auth/mfa/factors/${factorId}`, undefined, passed.data.token)
        expect(disable.status).toBeGreaterThanOrEqual(400)
        const still = await call("post", "/auth/user/emailpass", { email: EMAIL, password: PASSWORD })
        expect(still.data.mfa_challenge).toBeTruthy()
      })
    })
  },
})
