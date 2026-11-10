import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { acceptSellerInviteWorkflow } from "../../../workflows/seller/accept-seller-invite"

// POST /sellers/accept (TASKS P5-03), called with the registration token from
// POST /auth/seller/emailpass/register. Links that auth identity to the
// seller the admin created with the same email. Then the seller signs in at
// POST /auth/seller/emailpass.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  if (req.auth_context.actor_id) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "This account is already a seller.")
  }
  const { result } = await acceptSellerInviteWorkflow(req.scope).run({
    input: { auth_identity_id: req.auth_context.auth_identity_id },
  })
  res.json({ seller: result })
}
