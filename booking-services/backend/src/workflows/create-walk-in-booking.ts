import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// TASKS P3-11 (BUILD_PLAN §6.3): staff book a customer at the counter. Same
// row lock, opening hours and capacity as an online hold (createHold), but
// confirmed straight away with no hold and no cart; it may start up to now.
// Compensation deletes it.

export type CreateWalkInBookingInput = {
  resource_id: string
  starts_at: string
  ends_at: string
  customer_id?: string | null
  notes?: string | null
}

const createWalkInStep = createStep(
  "create-walk-in",
  async (input: CreateWalkInBookingInput, { container }) => {
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const created = await booking.createHold({
      resource_id: input.resource_id,
      starts_at: new Date(input.starts_at),
      ends_at: new Date(input.ends_at),
      customer_id: input.customer_id ?? null,
      notes: input.notes ?? null,
      walk_in: true,
    })
    return new StepResponse(created, created.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    await container.resolve<BookingModuleService>(BOOKING_MODULE).deleteBookings(id)
  }
)

export const createWalkInBookingWorkflow = createWorkflow(
  "create-walk-in-booking",
  function (input: CreateWalkInBookingInput) {
    const booking = createWalkInStep(input)
    return new WorkflowResponse(booking)
  }
)
