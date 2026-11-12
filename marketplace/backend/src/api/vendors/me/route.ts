import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { vendorResponse } from "../../vendor-auth"

// GET /vendors/me (TASKS P6-03): the signed-in vendor admin and their vendor,
// including its status, so a pending vendor can see it waits for approval.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await vendorResponse(req.scope, req.auth_context.actor_id))
}
