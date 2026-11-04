import type { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createWalkInBookingWorkflow } from "../../../../workflows/create-walk-in-booking"
import { parseBookingQuery } from "../../../store/booking/query"
import { GetAdminBookings, type PostAdminWalkInType } from "../validators"

// GET /admin/booking/bookings?from=&to=[&resource_id=] (TASKS P3-11): the
// calendar's bookings overlapping a time window (a day or a week), with the
// customer and order. Holds that ran out are left out; cancelled and expired
// bookings are listed so the calendar can show them greyed out.
// POST /admin/booking/bookings: a walk-in booking (confirmed at the counter).
export const BOOKING_FIELDS = [
  "id",
  "status",
  "starts_at",
  "ends_at",
  "hold_expires_at",
  "notes",
  "customer_id",
  "resource.id",
  "resource.name",
  "resource.timezone",
  "order.id",
  "order.display_id",
]

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { resource_id, from, to } = parseBookingQuery(GetAdminBookings, req.query)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "booking",
    fields: BOOKING_FIELDS,
    filters: {
      ...(resource_id ? { resource_id } : {}),
      starts_at: { $lt: new Date(to) },
      ends_at: { $gt: new Date(from) },
    },
    pagination: { order: { starts_at: "ASC" }, take: 500 },
  })
  const now = Date.now()
  const bookings = data.filter(
    (b) => !(b.status === "pending" && b.hold_expires_at && new Date(b.hold_expires_at).getTime() <= now)
  )
  const customerIds = [...new Set(bookings.map((b) => b.customer_id).filter((id): id is string => !!id))]
  const customers = new Map<string, { email: string | null; first_name: string | null; last_name: string | null }>()
  if (customerIds.length) {
    const { data: rows } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name"],
      filters: { id: customerIds },
    })
    for (const c of rows) {
      customers.set(c.id, c)
    }
  }
  res.json({
    bookings: bookings.map((b) => ({
      ...b,
      customer: b.customer_id ? customers.get(b.customer_id) ?? null : null,
    })),
  })
}

export const POST = async (req: AuthenticatedMedusaRequest<PostAdminWalkInType>, res: MedusaResponse) => {
  const { result } = await createWalkInBookingWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json({ booking: result })
}
