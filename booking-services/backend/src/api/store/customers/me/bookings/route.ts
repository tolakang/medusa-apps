import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /store/customers/me/bookings (TASKS P3-13, F-049): the signed-in
// customer's bookings for the account page, newest start first, with the
// resource and the order number. /store/customers/me* is customer-only in
// Medusa. Holds that ran out are left out.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "booking",
    fields: [
      "id",
      "status",
      "starts_at",
      "ends_at",
      "notes",
      "hold_expires_at",
      "resource.name",
      "resource.timezone",
      "order.id",
      "order.display_id",
    ],
    filters: { customer_id: req.auth_context.actor_id },
    pagination: { order: { starts_at: "DESC" }, take: 100 },
  })
  const now = Date.now()
  res.json({
    bookings: data
      .filter((b) => !(b.status === "pending" && b.hold_expires_at && new Date(b.hold_expires_at).getTime() <= now))
      .map(({ hold_expires_at: _hold, ...b }) => ({ ...b, order: b.order ?? null })),
  })
}
