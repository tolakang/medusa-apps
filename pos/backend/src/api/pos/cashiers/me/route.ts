import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { POS_MODULE } from "../../../../modules/pos"
import type PosModuleService from "../../../../modules/pos/service"

// GET /pos/cashiers/me (TASKS P2-03): the signed-in cashier.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const pos: PosModuleService = req.scope.resolve(POS_MODULE)
  const cashier = await pos.retrievePosCashier(req.auth_context.actor_id)
  res.json({ cashier })
}
