import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createVendorOrdersWorkflow } from "../../../../../workflows/marketplace/create-vendor-orders"

// POST /store/carts/:id/complete-vendor (BUILD_PLAN §6.6, TASKS P6-05): the
// marketplace storefront calls this instead of POST /store/carts/:id/complete
// (P6-08). It completes the cart into the parent order (payment) and makes
// one child order per vendor. The answer has the core route's shape
// (`{ type: "order", order }`) plus the child order ids.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { result } = await createVendorOrdersWorkflow(req.scope).run({
    input: { cart_id: req.params.id },
  })
  const {
    data: [order],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    // The storefront redirects to /<country>/order/<id>/confirmed with the
    // shipping address's country (lib/data/cart.ts placeOrder).
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "total",
      "status",
      "created_at",
      "shipping_address.country_code",
    ],
    filters: { id: result.parent_order_id },
  })
  res.json({ type: "order", order, vendor_orders: result.child_orders })
}
