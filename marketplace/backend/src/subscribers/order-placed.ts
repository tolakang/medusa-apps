import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { notifyOrderPlacedWorkflow } from "../workflows/notify-order-placed"

// Payload of order.placed is the order ID (Medusa docs, events and subscribers).
export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await notifyOrderPlacedWorkflow(container).run({ input: { id: data.id } })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
