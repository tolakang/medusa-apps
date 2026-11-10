import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { adjustSellerCommissionWorkflow } from "../workflows/seller/adjust-commission"

// TASKS P5-04: a cancelled order cancels its seller's commission.
export default async function sellerCommissionOnOrderCanceled({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await adjustSellerCommissionWorkflow(container).run({
    input: { order_id: data.id, kind: "canceled" },
  })
}

export const config: SubscriberConfig = { event: "order.canceled" }
