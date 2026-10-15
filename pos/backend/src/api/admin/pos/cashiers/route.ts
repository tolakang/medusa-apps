import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { POS_MODULE } from "../../../../modules/pos"
import type PosModuleService from "../../../../modules/pos/service"
import { createPosCashierWorkflow } from "../../../../workflows/pos-cashier"
import type { PostAdminPosCashierType } from "./validators"

// GET/POST /admin/pos/cashiers (TASKS P2-03): admins list and invite cashiers.
// /admin/* requires an admin user (MEDUSA_SKILL §7). The invited cashier then
// registers the same email at /auth/cashier/emailpass/register and accepts at
// /pos/cashiers/accept.

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const pos: PosModuleService = req.scope.resolve(POS_MODULE)
  const cashiers = await pos.listPosCashiers({}, { order: { name: "ASC" } })
  res.json({ cashiers })
}

export const POST = async (req: MedusaRequest<PostAdminPosCashierType>, res: MedusaResponse) => {
  const { result } = await createPosCashierWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json({ cashier: result })
}
