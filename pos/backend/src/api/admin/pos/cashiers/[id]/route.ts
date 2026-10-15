import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updatePosCashierWorkflow } from "../../../../../workflows/pos-cashier"
import type { PostAdminPosCashierUpdateType } from "../../validators"

// POST /admin/pos/cashiers/:id (TASKS P2-06): rename or (de)activate a
// cashier. A deactivated cashier's token stops working at once (pos-auth.ts).
export const POST = async (req: MedusaRequest<PostAdminPosCashierUpdateType>, res: MedusaResponse) => {
  const { result } = await updatePosCashierWorkflow(req.scope).run({
    input: { ...req.validatedBody, id: req.params.id },
  })
  res.json({ cashier: result })
}
