import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { cancelBookingWorkflow } from "../../../../../../workflows/cancel-booking"

// POST /admin/booking/bookings/:id/cancel (TASKS P3-11): staff cancel any
// booking; the policy decides the refund (cancel-booking, P3-08).
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { result } = await cancelBookingWorkflow(req.scope).run({
    input: { booking_id: req.params.id, created_by: req.auth_context.actor_id },
  })
  res.json({
    booking: { id: result.booking.id, status: result.booking.status },
    refund: result.refund,
    refunded_amount: result.refunded_amount,
  })
}
