import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  findPosSale,
  POS_SALE_RECORDED_MESSAGE,
  posCheckoutWorkflow,
} from "../../../workflows/pos-checkout"
import type { PostPosCheckoutType } from "../validators"

// POST /pos/checkout (TASKS P2-06): a sale on the open shift (pos-checkout,
// P2-05). Returns the order with what the receipt prints. A retry with the
// same client_ref (the answer was lost) gets the sale already recorded,
// with 200 instead of 201 (review 2, S7).
export const POST = async (req: AuthenticatedMedusaRequest<PostPosCheckoutType>, res: MedusaResponse) => {
  let orderId: string
  let status = 201
  try {
    const { result } = await posCheckoutWorkflow(req.scope).run({
      input: { ...req.validatedBody, cashier_id: req.auth_context.actor_id },
    })
    orderId = result.order_id
  } catch (error) {
    const clientRef = req.validatedBody.client_ref
    const recorded =
      (error as Error)?.message === POS_SALE_RECORDED_MESSAGE && clientRef
        ? await findPosSale(req.scope, req.validatedBody.shift_id, clientRef)
        : null
    if (!recorded) {
      throw error
    }
    orderId = recorded
    status = 200
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "created_at",
      "currency_code",
      "email",
      "customer_id",
      "subtotal",
      "discount_total",
      "tax_total",
      "total",
      "items.id",
      "items.title",
      "items.variant_title",
      "items.variant_sku",
      "items.quantity",
      "items.unit_price",
      "items.total",
    ],
    filters: { id: orderId },
  })
  res.status(status).json({ order, payment_method: req.validatedBody.payment_method })
}
