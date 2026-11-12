import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { PARENT_ORDER_KEY } from "../../../workflows/marketplace/create-vendor-orders"
import { GetAdminVendorCommissions } from "./validators"

// GET /admin/vendor-commissions (F-078): vendor commissions with their vendor,
// child order and parent order's refunds, newest first. The payout report's
// "Refunds to review" is `?refund_review=to_review`.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const parsed = GetAdminVendorCommissions.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.issues[0].message)
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: commissions } = await query.graph({
    entity: "vendor_commission",
    fields: [
      "id",
      "order_id",
      "order_total",
      "base",
      "rate",
      "amount",
      "payout_amount",
      "currency_code",
      "status",
      "refund_review",
      "created_at",
      "vendor.id",
      "vendor.name",
    ],
    filters: parsed.data,
    pagination: { order: { created_at: "DESC" } },
  })
  const orderIds = commissions.map((c) => c.order_id)
  const { data: children } = orderIds.length
    ? await query.graph({ entity: "order", fields: ["id", "display_id", "metadata"], filters: { id: orderIds } })
    : { data: [] }
  const parentIds = children
    .map((c) => c.metadata?.[PARENT_ORDER_KEY] as string | undefined)
    .filter(Boolean) as string[]
  const { data: parents } = parentIds.length
    ? await query.graph({
        entity: "order",
        fields: ["id", "display_id", "currency_code", "payment_collections.refunded_amount", "payment_collections.captured_amount"],
        filters: { id: parentIds },
      })
    : { data: [] }
  const childById = new Map(children.map((c) => [c.id, c]))
  const parentById = new Map(parents.map((p) => [p.id, p]))
  res.json({
    vendor_commissions: commissions.map((c) => {
      const child = childById.get(c.order_id)
      const parent = parentById.get(child?.metadata?.[PARENT_ORDER_KEY] as string)
      const sum = (key: "refunded_amount" | "captured_amount") =>
        (parent?.payment_collections ?? []).reduce((s, pc) => s + Number(pc?.[key] ?? 0), 0)
      return {
        ...c,
        order: child ? { id: child.id, display_id: child.display_id } : null,
        parent_order: parent
          ? { id: parent.id, display_id: parent.display_id, captured: sum("captured_amount"), refunded: sum("refunded_amount") }
          : null,
      }
    }),
    count: commissions.length,
  })
}
