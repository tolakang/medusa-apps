import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { openPosShiftWorkflow } from "../../../../workflows/pos-shift"
import type { PostPosShiftOpenType } from "../../validators"

// POST /pos/shifts/open (TASKS P2-06): the signed-in cashier opens a shift
// on a register (one open shift per register, P2-04).
export const POST = async (req: AuthenticatedMedusaRequest<PostPosShiftOpenType>, res: MedusaResponse) => {
  const { result: shift } = await openPosShiftWorkflow(req.scope).run({
    input: { ...req.validatedBody, cashier_id: req.auth_context.actor_id },
  })
  res.status(201).json({ shift })
}
