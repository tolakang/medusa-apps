import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { confirmOrderBookingsWorkflow } from "../workflows/confirm-order-bookings"

// TASKS P3-07: confirm an order's bookings and link them to it. The order
// notifications have their own order.placed subscriber (order-placed.ts).
export default async function bookingOrderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await confirmOrderBookingsWorkflow(container).run({ input: { order_id: data.id } })
}

export const config: SubscriberConfig = { event: "order.placed" }
