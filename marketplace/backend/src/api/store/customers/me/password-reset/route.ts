import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { generateResetPasswordTokenWorkflow } from "@medusajs/medusa/core-flows"

// POST /store/customers/me/password-reset: "Email me a reset link" in Account
// → Profile (TASKS P1-18). The signed-in customer needs no CAPTCHA, so this
// doesn't go through the public reset route; it runs the same core workflow
// as POST /auth/customer/emailpass/reset-password (which emits
// auth.password_reset → the reset email) for this customer's own login email.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const auth = req.scope.resolve(Modules.AUTH)
  const identity = await auth.retrieveAuthIdentity(req.auth_context.auth_identity_id, {
    relations: ["provider_identities"],
  })
  const login = identity.provider_identities?.find((p) => p.provider === "emailpass")
  if (!login) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This account signs in without a password.")
  }
  const { http } = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig
  await generateResetPasswordTokenWorkflow(req.scope).run({
    input: {
      entityId: login.entity_id,
      actorType: "customer",
      provider: "emailpass",
      secret: http.jwtSecret!,
      jwtOptions: http.jwtOptions,
    },
  })
  res.status(201).json({ success: true })
}
