import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// TASKS P3-09 / P3-15 (BUILD_PLAN §6.3): an abandoned checkout frees its slot.
// The slot is free for new holds as soon as hold_expires_at passes (P3-03);
// this marks those holds `expired` so they show as released everywhere.
// Run every minute by src/jobs/release-expired-holds.ts. Idempotent: a hold
// that is already expired isn't pending any more. A hold whose cart has
// already become an order is skipped: the order.placed confirmation (queued
// behind it) confirms it, and expiring it first left a paid order without
// its booking (review 2, S4).

const releaseExpiredHoldsStep = createStep(
  "release-expired-holds",
  async (input: { limit?: number }, { container }) => {
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const due = await booking.listBookings(
      { status: "pending", hold_expires_at: { $lte: new Date() } },
      { select: ["cart_id"], take: input.limit ?? 500 }
    )
    const cartIds = [...new Set(due.map((b) => b.cart_id).filter((id): id is string => !!id))]
    let completed: string[] = []
    if (cartIds.length) {
      const { data: carts } = await container
        .resolve(ContainerRegistrationKeys.QUERY)
        .graph({ entity: "cart", fields: ["id", "completed_at"], filters: { id: cartIds } })
      completed = carts.filter((c) => !!c.completed_at).map((c) => c.id)
    }
    const released = await booking.releaseExpiredHolds({
      limit: input.limit,
      skip_cart_ids: completed,
    })
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
