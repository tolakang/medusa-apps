import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { vendorOrderIds, vendorOrders } from "../vendor-orders"

// GET /vendors/me/orders (TASKS P6-09): the signed-in vendor's orders (its
// child orders), newest first, with what's left to fulfil and its payout.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const orders = await vendorOrders(req, await vendorOrderIds(req))
  res.json({ orders, count: orders.length })
}
