import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// TASKS P3-09 / P3-15 (BUILD_PLAN §6.3): an abandoned checkout frees its slot.
// The slot is free for new holds as soon as hold_expires_at passes (P3-03);
// this marks those holds `expired` so they show as released everywhere.
// Run every minute by src/jobs/release-expired-holds.ts. Idempotent: a hold
// that is already expired isn't pending any more.

const releaseExpiredHoldsStep = createStep(
  "release-expired-holds",
  async (input: { limit?: number }, { container }) => {
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const released = await booking.releaseExpiredHolds({ limit: input.limit })
    return new StepResponse(
      released.map((b) => b.id),
      released.map((b) => b.id)
    )
  },
  async (ids, { container }) => {
    if (!ids?.length) {
      return
    }
    await container
      .resolve<BookingModuleService>(BOOKING_MODULE)
      .updateBookings(ids.map((id) => ({ id, status: "pending" as const })))
  }
)

export const releaseExpiredHoldsWorkflow = createWorkflow(
  "release-expired-holds",
  function (input: { limit?: number }) {
    const released = releaseExpiredHoldsStep(input)
    return new WorkflowResponse(released)
  }
)
