import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { recordSellerCommissionWorkflow } from "../workflows/seller/record-commission"

// TASKS P5-04: an order in an active seller's channel earns them a
// commission. The workflow is idempotent, so a repeated event is harmless.
// An error fails the subscriber, so the event bus can retry it.
export default async function sellerCommissionOnOrderPlaced({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await recordSellerCommissionWorkflow(container).run({ input: { order_id: data.id } })
}

export const config: SubscriberConfig = { event: "order.placed" }
