import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  CHILD_ORDERS_KEY,
  PARENT_ORDER_KEY,
} from "../../../../../workflows/marketplace/create-vendor-orders"

// GET /admin/orders/:id/marketplace (TASKS P6-07): for the order page's
// widget. A child order: its vendor and parent. A parent order: its child
// orders and their vendors. Neither: `{ kind: "plain" }`.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [order],
  } = await query.graph(
    {
      entity: "order",
      fields: ["id", "metadata", "vendor.id", "vendor.name", "vendor.handle"],
      filters: { id: req.params.id },
    },
    { throwIfKeyNotFound: true }
  )
  const parentId = order.metadata?.[PARENT_ORDER_KEY] as string | undefined
  if (order.vendor?.id || parentId) {
    const { data: parents } = parentId
      ? await query.graph({ entity: "order", fields: ["id", "display_id"], filters: { id: parentId } })
      : { data: [] }
    return res.json({ kind: "child", vendor: order.vendor ?? null, parent_order: parents[0] ?? null })
  }
  const childIds = (order.metadata?.[CHILD_ORDERS_KEY] ?? []) as string[]
  if (!childIds.length) {
    return res.json({ kind: "plain" })
  }
  const { data: children } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "status", "total", "currency_code", "vendor.id", "vendor.name"],
    filters: { id: childIds },
  })
  res.json({ kind: "parent", child_orders: children })
}
