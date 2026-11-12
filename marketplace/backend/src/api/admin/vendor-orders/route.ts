import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

const GetAdminVendorOrders = z.object({ vendor_id: z.string().min(1).optional() }).strict()

// GET /admin/vendor-orders (TASKS P6-07): the vendors' child orders (the ones
// vendors fulfil and reports count), newest first, with their vendor and
// parent order. The admin's own order list shows parents and children
// together; this is the "child orders only" view (plan §6.6).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const parsed = GetAdminVendorOrders.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.issues[0].message)
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: vendors } = await query.graph({
    entity: "vendor",
    fields: ["id", "name", "orders.id"],
    filters: parsed.data.vendor_id ? { id: parsed.data.vendor_id } : {},
  })
  const vendorOf = new Map<string, { id: string; name: string }>()
  for (const v of vendors) {
    for (const o of v.orders ?? []) {
      vendorOf.set(o!.id, { id: v.id, name: v.name })
    }
  }
  if (!vendorOf.size) {
    return res.json({ orders: [], count: 0 })
  }
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "total",
      "currency_code",
      "created_at",
      "metadata",
    ],
    filters: { id: [...vendorOf.keys()] },
    pagination: { order: { created_at: "DESC" } },
  })
  res.json({
    orders: orders.map(({ metadata, ...o }) => ({
      ...o,
      parent_order_id: (metadata?.parent_order_id as string | undefined) ?? null,
      vendor: vendorOf.get(o.id),
    })),
    count: orders.length,
  })
}
