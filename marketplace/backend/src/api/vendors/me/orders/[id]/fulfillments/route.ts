import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
import { ownVendorOrder } from "../../../vendor-orders"

export const NOTHING_TO_FULFIL_MESSAGE = "Everything in this order is already fulfilled."

// POST /vendors/me/orders/:id/fulfillments (TASKS P6-09, P6-10): the vendor
// fulfils what's left of its own order, with Medusa's
// createOrderFulfillmentWorkflow (it takes the stock reserved for the child
// order's items, P6-05, and uses the shipping option copied from the
// customer's order). Someone else's order answers 404.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const order = await ownVendorOrder(req, req.params.id)
  if (order.status === "canceled") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This order is canceled.")
  }
  const items = Object.entries(order.remaining)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => ({ id, quantity }))
  if (!items.length) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NOTHING_TO_FULFIL_MESSAGE)
  }
  await createOrderFulfillmentWorkflow(req.scope).run({
    input: { order_id: order.id, items },
  })
  res.json({ order: await ownVendorOrder(req, order.id) })
}
