import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import type { PostPosCashierAcceptType } from "../../validators"
import { acceptPosCashierInviteWorkflow } from "../../../../workflows/pos-cashier"

// POST /pos/cashiers/accept (TASKS P2-03), called with the registration token
// from POST /auth/cashier/emailpass/register. Links that auth identity to the
// cashier the admin invited with the same email, if the body carries that
// invitation's code (REVIEW_FIXES B11). Then the cashier signs in at
// POST /auth/cashier/emailpass.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostPosCashierAcceptType>,
  res: MedusaResponse
) => {
  if (req.auth_context.actor_id) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "This account is already a cashier.")
  }
  const { result } = await acceptPosCashierInviteWorkflow(req.scope).run({
    input: {
      auth_identity_id: req.auth_context.auth_identity_id,
      invite_code: req.validatedBody.invite_code,
    },
  })
  res.json({ cashier: result })
}
