import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, MathBN } from "@medusajs/framework/utils"

// The signed-in vendor's child orders (TASKS P6-09, P6-10): every vendor
// order route goes through here, so a vendor only ever sees and fulfils its
// own orders (someone else's answers 404, as Medusa's own routes do).

export const VENDOR_ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "created_at",
  "email",
  "currency_code",
  "total",
  "item_total",
  "shipping_total",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.address_1",
  "shipping_address.address_2",
  "shipping_address.city",
  "shipping_address.province",
  "shipping_address.postal_code",
  "shipping_address.country_code",
  "shipping_address.phone",
  "items.id",
  "items.title",
  "items.variant_title",
  "items.variant_sku",
  "items.quantity",
  "items.unit_price",
  "shipping_methods.name",
  "fulfillments.id",
  "fulfillments.created_at",
  "fulfillments.canceled_at",
  "fulfillments.items.line_item_id",
  "fulfillments.items.quantity",
]

export async function vendorIdOf(req: AuthenticatedMedusaRequest): Promise<string> {
  const {
    data: [admin],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "vendor_admin",
    fields: ["vendor.id"],
    filters: { id: req.auth_context.actor_id },
  })
  if (!admin?.vendor?.id) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Vendor not found.")
  }
  return admin.vendor.id
}

export async function vendorOrderIds(req: AuthenticatedMedusaRequest): Promise<string[]> {
  const vendorId = await vendorIdOf(req)
  const {
    data: [vendor],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "vendor",
    fields: ["orders.id"],
    filters: { id: vendorId },
  })
  return (vendor?.orders ?? []).map((o) => o!.id)
}

type OrderRow = Record<string, any>

/** Each item's quantity not yet in an active fulfilment. */
export function remainingByItem(order: OrderRow): Record<string, number> {
  const done: Record<string, ReturnType<typeof MathBN.convert>> = {}
  for (const f of order.fulfillments ?? []) {
    if (f?.canceled_at) {
      continue
    }
    for (const fi of f?.items ?? []) {
      done[fi.line_item_id] = MathBN.add(done[fi.line_item_id] ?? 0, fi.quantity)
    }
  }
  return Object.fromEntries(
    (order.items ?? []).map((i: OrderRow) => [
      i.id,
      Math.max(0, MathBN.sub(i.quantity, done[i.id] ?? 0).toNumber()),
    ])
  )
}

/** The vendor's view of an order: what's left to fulfil, and the payout. */
export async function vendorOrders(req: AuthenticatedMedusaRequest, ids: string[]) {
  if (!ids.length) {
    return []
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: VENDOR_ORDER_FIELDS,
    filters: { id: ids },
    pagination: { order: { created_at: "DESC" } },
  })
  const { data: commissions } = await query.graph({
    entity: "vendor_commission",
    fields: ["order_id", "rate", "amount", "payout_amount", "status"],
    filters: { order_id: ids },
  })
  const commissionOf = new Map(commissions.map((c) => [c.order_id, c]))
  return orders.map((o) => {
    const remaining = remainingByItem(o)
    const { order_id: _o, ...commission } = commissionOf.get(o.id) ?? ({} as Record<string, unknown>)
    return {
      ...o,
      fulfillments: (o.fulfillments ?? []).filter((f) => !f?.canceled_at),
      remaining,
      fully_fulfilled: Object.values(remaining).every((q) => q === 0),
      commission: commissionOf.has(o.id) ? commission : null,
    }
  })
}

/** One of the vendor's orders, or 404. */
export async function ownVendorOrder(req: AuthenticatedMedusaRequest, id: string) {
  const ids = await vendorOrderIds(req)
  if (!ids.includes(id)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id: ${id} was not found`)
  }
  const [order] = await vendorOrders(req, [id])
  return order
}
