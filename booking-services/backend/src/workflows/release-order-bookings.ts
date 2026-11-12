import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// A cancelled order releases its bookings (review 2, S5): pending and
// confirmed ones become `cancelled`, so the time is free again and no
// reminder goes out. No refund here: cancelling the order already refunded
// it (core cancelOrderWorkflow). Bookings are found through the
// booking → order link (P3-02). Idempotent: cancelled ones are skipped.
type Previous = { id: string; status: string }

const releaseOrderBookingsStep = createStep(
  "release-order-bookings",
  async (input: { order_id: string }, { container }) => {
    const {
      data: [order],
    } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "order",
      fields: ["id", "bookings.id", "bookings.status"],
      filters: { id: input.order_id },
    })
    const open: Previous[] = (order?.bookings ?? []).flatMap((b) =>
      b && (b.status === "pending" || b.status === "confirmed")
        ? [{ id: b.id as string, status: b.status as string }]
        : []
    )
    if (!open.length) {
      return new StepResponse([] as string[], [] as Previous[])
    }
    await container
      .resolve<BookingModuleService>(BOOKING_MODULE)
      .updateBookings(open.map((b) => ({ id: b.id, status: "cancelled" as const })))
    return new StepResponse(
      open.map((b) => b.id),
      open.map((b) => ({ id: b.id, status: b.status }))
    )
  },
  async (previous, { container }) => {
    if (!previous?.length) {
      return
    }
    await container
      .resolve<BookingModuleService>(BOOKING_MODULE)
      .updateBookings(
        previous.map((p) => ({ id: p.id, status: p.status as "pending" | "confirmed" }))
      )
  }
)

export const releaseOrderBookingsWorkflow = createWorkflow(
  "release-order-bookings",
  function (input: { order_id: string }) {
    return new WorkflowResponse(releaseOrderBookingsStep(input))
  }
)
