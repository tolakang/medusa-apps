import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { cancelVendorCommissionWorkflow } from "../workflows/marketplace/record-vendor-commission"

// A cancelled child order cancels its vendor commission before payout
// (TASKS P6-06). Errors fail the subscriber, so the event bus can retry.
export default async function vendorCommissionOrderCanceled({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await cancelVendorCommissionWorkflow(container).run({ input: { order_id: data.id } })
}

export const config: SubscriberConfig = { event: "order.canceled" }
