import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// TASKS P3-06 (BUILD_PLAN §6.3): renew a cart's booking holds when the
// customer starts paying. Run by the middleware on
// POST /store/payment-collections/:id/payment-sessions (src/api/middlewares.ts):
// createPaymentSessionsWorkflow has no hooks in 2.22.2 and no event is
// emitted for a new payment session.

const extendCartHoldsStep = createStep(
  "extend-cart-holds",
  async (input: { cart_id: string }, { container }) => {
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const extended = await booking.extendCartHolds({ cart_id: input.cart_id })
    return new StepResponse(
      extended,
      extended.map((h) => ({
        id: h.id,
        hold_expires_at: h.previous_hold_expires_at
          ? new Date(h.previous_hold_expires_at).toISOString()
          : null,
      }))
    )
  },
  async (previous, { container }) => {
    if (!previous?.length) {
      return
    }
    await container.resolve<BookingModuleService>(BOOKING_MODULE).updateBookings(
      previous.map((p) => ({
        id: p.id,
        hold_expires_at: p.hold_expires_at ? new Date(p.hold_expires_at) : null,
      }))
    )
  }
)

export const extendBookingHoldsWorkflow = createWorkflow(
  "extend-booking-holds",
  function (input: { cart_id: string }) {
    const extended = extendCartHoldsStep(input)
    return new WorkflowResponse(extended)
  }
)
