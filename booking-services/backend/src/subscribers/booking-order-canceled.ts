import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { releaseOrderBookingsWorkflow } from "../workflows/release-order-bookings"

// A cancelled order frees its booked times (review 2, S5). Errors fail the
// subscriber, so the event bus can retry.
export default async function bookingOrderCanceledHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await releaseOrderBookingsWorkflow(container).run({ input: { order_id: data.id } })
}

export const config: SubscriberConfig = { event: "order.canceled" }
