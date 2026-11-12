import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { changePasswordWorkflow } from "../../../../../workflows/change-password"
import type { PostCustomerPasswordType } from "./validators"

// POST /store/customers/me/password { current_password, new_password }
// (owner, 2026-10-06). /store/customers/me* requires a signed-in customer
// (Medusa's built-in protection); the body is validated in middlewares.ts.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostCustomerPasswordType>,
  res: MedusaResponse
) => {
  await changePasswordWorkflow(req.scope).run({
    input: {
      auth_identity_id: req.auth_context.auth_identity_id,
      current_password: req.validatedBody.current_password,
      new_password: req.validatedBody.new_password,
    },
  })
  res.json({ success: true })
}
