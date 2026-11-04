import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { cancelBookingWorkflow } from "../../../../workflows/cancel-booking"
import type { PostBookingCancelType } from "../validators"

// POST /store/booking/cancel { booking_id } (TASKS P3-10): a signed-in
// customer cancels one of their bookings; the policy decides the refund
// (cancel-booking, P3-08). Another customer's booking answers 404.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostBookingCancelType>,
  res: MedusaResponse
) => {
  const { result } = await cancelBookingWorkflow(req.scope).run({
    input: {
      booking_id: req.validatedBody.booking_id,
      customer_id: req.auth_context.actor_id,
      created_by: req.auth_context.actor_id,
    },
  })
  res.json({
    booking: { id: result.booking.id, status: result.booking.status },
    refund: result.refund,
    refunded_amount: result.refunded_amount,
  })
}
