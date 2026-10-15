import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { posCheckoutWorkflow } from "../../../workflows/pos-checkout"
import type { PostPosCheckoutType } from "../validators"

// POST /pos/checkout (TASKS P2-06): a sale on the open shift (pos-checkout,
// P2-05). Returns the order with what the receipt prints.
export const POST = async (req: AuthenticatedMedusaRequest<PostPosCheckoutType>, res: MedusaResponse) => {
  const { result } = await posCheckoutWorkflow(req.scope).run({
    input: { ...req.validatedBody, cashier_id: req.auth_context.actor_id },
  })
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
    filters: { id: result.order_id },
  })
  res.status(201).json({ order, payment_method: result.payment_method })
}
