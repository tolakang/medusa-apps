import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { closePosShiftWorkflow } from "../../../../workflows/pos-shift"
import type { PostPosShiftCloseType } from "../../validators"

// POST /pos/shifts/close (TASKS P2-06): the signed-in cashier counts the
// drawer and closes the shift; returns the expected cash and the variance.
export const POST = async (req: AuthenticatedMedusaRequest<PostPosShiftCloseType>, res: MedusaResponse) => {
  const { result } = await closePosShiftWorkflow(req.scope).run({
    input: { ...req.validatedBody, cashier_id: req.auth_context.actor_id },
  })
  res.json(result)
}
