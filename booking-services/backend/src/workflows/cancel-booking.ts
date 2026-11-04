import { ContainerRegistrationKeys, MathBN, MedusaError } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { refundPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { cancelDecision } from "../lib/booking-cancel-policy"
import { bookingIdOf } from "../lib/booking-cart-rules"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// TASKS P3-08 (BUILD_PLAN §6.3): cancel a booking with the cancellation
// policy and refund it. A pending hold or a confirmed booking can be
// cancelled until it starts; a confirmed booking cancelled at least
// BOOKING_CANCEL_HOURS before the start is refunded the amount of its order
// item, from a captured payment of its order (P3-16: inside the policy
// refunds, outside it doesn't). The refund runs last (money can't be rolled
// back) and carries an idempotency key, so a retried cancellation never
// refunds twice at the provider.

export type CancelBookingInput = {
  booking_id: string
  // Set when the customer cancels: the booking must be theirs.
  customer_id?: string
  // Who cancels, for the refund record (an admin user or customer id).
  created_by?: string
}

export type RefundOutcome =
  | "refunded"
  | "outside_policy" // cancelled too late: no refund
  | "no_order" // a hold or walk-in without an order: nothing was paid
  | "not_captured" // the order's payment isn't captured yet: nothing to refund

type Plan = {
  booking_id: string
  previous: { status: string; hold_expires_at: string | null }
  outcome: RefundOutcome
  refund: { payment_id: string; amount: number; idempotency_key: string; note: string } | null
}

type Money = number | string | { toJSON?: () => unknown } | null | undefined
const num = (v: Money): number => (v === null || v === undefined ? 0 : MathBN.convert(v as number).toNumber())

const planCancellationStep = createStep(
  "plan-cancellation",
  async (input: CancelBookingInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const service = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const {
      data: [booking],
    } = await query.graph({
      entity: "booking",
      fields: [
        "id",
        "status",
        "starts_at",
        "customer_id",
        "hold_expires_at",
        "order.id",
      ],
      filters: { id: input.booking_id },
    })
    if (!booking) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Booking ${input.booking_id} was not found.`)
    }
    if (input.customer_id !== undefined && booking.customer_id !== input.customer_id) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Booking ${input.booking_id} was not found.`)
    }

    const decision = cancelDecision(booking, new Date(), service.cancelHours)
    if (!decision.allowed) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, decision.message)
    }

    const previous = {
      status: booking.status,
      hold_expires_at: booking.hold_expires_at ? new Date(booking.hold_expires_at).toISOString() : null,
    }
    // Read the order itself: the order module computes item totals only
    // when a top-level total field is selected (OrderModuleService
    // shouldIncludeTotals), which a nested booking.order.items.total isn't.
    const order = booking.order?.id
      ? (
          await query.graph({
            entity: "order",
            fields: [
              "id",
              "total",
              "items.id",
              "items.metadata",
              "items.total",
              "payment_collections.payments.id",
              "payment_collections.payments.captures.amount",
              "payment_collections.payments.refunds.amount",
            ],
            filters: { id: booking.order.id },
          })
        ).data[0]
      : undefined
    const plan = (outcome: RefundOutcome, refund: Plan["refund"] = null): Plan => ({
      booking_id: booking.id,
      previous,
      outcome,
      refund,
    })

    if (!order) {
      return new StepResponse(plan("no_order"))
    }
    if (!decision.refund) {
      return new StepResponse(plan("outside_policy"))
    }

    const item = (order.items ?? []).find(
      (i) => bookingIdOf(i?.metadata as Record<string, unknown> | null) === booking.id
    )
    const amount = num(item?.total as Money)
    // Captured minus already refunded, per payment; refund from the one with
    // the most left (an order normally has one).
    const payments = (order.payment_collections ?? [])
      .flatMap((c) => c?.payments ?? [])
      .filter(Boolean)
      .map((p) => ({
        id: p!.id,
        available:
          (p!.captures ?? []).reduce((s, c) => s + num(c?.amount as Money), 0) -
          (p!.refunds ?? []).reduce((s, r) => s + num(r?.amount as Money), 0),
      }))
      .sort((a, b) => b.available - a.available)
    const payment = payments[0]
    if (!payment || payment.available <= 0 || amount <= 0) {
      return new StepResponse(plan("not_captured"))
    }

    return new StepResponse(
      plan("refunded", {
        payment_id: payment.id,
        amount: Math.min(amount, payment.available),
        idempotency_key: `booking_cancel_${booking.id}`,
        note: `Booking ${booking.id} cancelled within the cancellation policy.`,
      })
    )
  }
)

const markBookingCancelledStep = createStep(
  "mark-booking-cancelled",
  async (input: Plan, { container }) => {
    const service = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const booking = await service.updateBookings({
      id: input.booking_id,
      status: "cancelled",
      hold_expires_at: null,
    })
    return new StepResponse(booking, { id: input.booking_id, ...input.previous })
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }
    await container.resolve<BookingModuleService>(BOOKING_MODULE).updateBookings({
      id: previous.id,
      status: previous.status as "confirmed",
      hold_expires_at: previous.hold_expires_at ? new Date(previous.hold_expires_at) : null,
    })
  }
)

export const cancelBookingWorkflow = createWorkflow(
  "cancel-booking",
  function (input: CancelBookingInput) {
    const plan = planCancellationStep(input)
    const booking = markBookingCancelledStep(plan)

    when("refund-cancelled-booking", plan, (p) => p.refund !== null).then(() => {
      const refundInput = transform({ plan, input }, ({ plan, input }) => ({
        payment_id: plan.refund!.payment_id,
        amount: plan.refund!.amount,
        idempotency_key: plan.refund!.idempotency_key,
        note: plan.refund!.note,
        created_by: input.created_by,
      }))
      refundPaymentWorkflow.runAsStep({ input: refundInput })
    })

    const result = transform({ booking, plan }, ({ booking, plan }) => ({
      booking,
      refund: plan.outcome,
      refunded_amount: plan.refund?.amount ?? 0,
    }))
    return new WorkflowResponse(result)
  }
)
