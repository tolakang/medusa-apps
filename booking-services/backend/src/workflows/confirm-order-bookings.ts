import type { LinkDefinition } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createRemoteLinkStep } from "@medusajs/medusa/core-flows"
import { bookingIdOf } from "../lib/booking-cart-rules"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// TASKS P3-07 (BUILD_PLAN §6.3): when an order is placed, confirm its
// bookings and link them to the order (link booking → order, P3-02). Run by
// the order.placed subscriber; idempotent, so a repeated event changes
// nothing: confirmed bookings are skipped and existing links aren't made
// again. The order's items keep the cart item's metadata, so the bookings
// are found through metadata.booking_id (P3-04).

type OrderBookings = {
  order_id: string
  customer_id: string | null
  booking_ids: string[]
  linked_ids: string[]
}

const loadOrderBookingsStep = createStep(
  "load-order-bookings",
  async (input: { order_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: ["id", "customer_id", "items.metadata", "bookings.id"],
      filters: { id: input.order_id },
    })
    const ids = (order?.items ?? [])
      .map((i) => bookingIdOf(i?.metadata as Record<string, unknown> | null))
      .filter((id): id is string => !!id)
    const result: OrderBookings = {
      order_id: input.order_id,
      customer_id: order?.customer_id ?? null,
      booking_ids: [...new Set(ids)],
      linked_ids: (order?.bookings ?? []).map((b) => b?.id).filter((id): id is string => !!id),
    }
    return new StepResponse(result)
  }
)

type PreviousState = { id: string; status: string; hold_expires_at: string | null; customer_id: string | null }

const confirmBookingsStep = createStep(
  "confirm-bookings",
  async (input: OrderBookings, { container }) => {
    if (!input.booking_ids.length) {
      return new StepResponse([] as string[], [] as PreviousState[])
    }
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const rows = await booking.listBookings({ id: input.booking_ids })

    const pending = rows.filter((b) => b.status === "pending")
    for (const b of rows) {
      if (b.status !== "pending" && b.status !== "confirmed") {
        // P3-05 refuses checkout for released bookings, so this means the
        // order was placed some other way: report it, don't confirm it.
        logger.warn(`Order ${input.order_id}: booking ${b.id} is ${b.status}, not confirmed.`)
      }
    }
    if (pending.length) {
      await booking.updateBookings(
        pending.map((b) => ({
          id: b.id,
          status: "confirmed" as const,
          hold_expires_at: null,
          customer_id: b.customer_id ?? input.customer_id,
        }))
      )
    }
    const previous: PreviousState[] = pending.map((b) => ({
      id: b.id,
      status: b.status,
      hold_expires_at: b.hold_expires_at ? new Date(b.hold_expires_at).toISOString() : null,
      customer_id: b.customer_id ?? null,
    }))
    return new StepResponse(
      rows.filter((b) => b.status === "pending" || b.status === "confirmed").map((b) => b.id),
      previous
    )
  },
  async (previous, { container }) => {
    if (!previous?.length) {
      return
    }
    await container.resolve<BookingModuleService>(BOOKING_MODULE).updateBookings(
      previous.map((p) => ({
        id: p.id,
        status: p.status as "pending",
        hold_expires_at: p.hold_expires_at ? new Date(p.hold_expires_at) : null,
        customer_id: p.customer_id,
      }))
    )
  }
)

export const confirmOrderBookingsWorkflow = createWorkflow(
  "confirm-order-bookings",
  function (input: { order_id: string }) {
    const loaded = loadOrderBookingsStep(input)
    const confirmed = confirmBookingsStep(loaded)

    const links = transform({ loaded, confirmed }, ({ loaded, confirmed }): LinkDefinition[] =>
      confirmed
        .filter((id) => !loaded.linked_ids.includes(id))
        .map((booking_id) => ({
          [BOOKING_MODULE]: { booking_id },
          [Modules.ORDER]: { order_id: loaded.order_id },
        }))
    )
    createRemoteLinkStep(links)

    return new WorkflowResponse(confirmed)
  }
)
