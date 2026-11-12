import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ownVendorOrder } from "../../vendor-orders"

// GET /vendors/me/orders/:id (TASKS P6-09): one of the vendor's own orders;
// anyone else's answers 404.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ order: await ownVendorOrder(req, req.params.id) })
}
