import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adjustSellerCommissionWorkflow } from "../workflows/seller/adjust-commission"

// TASKS P5-04: a refund recalculates the seller's commission on what the
// shop kept. payment.refunded carries the payment's ID; its payment
// collection leads to the order.
export default async function sellerCommissionOnPaymentRefunded({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [payment],
  } = await query.graph({
    entity: "payment",
    fields: ["id", "payment_collection.order.id"],
    filters: { id: data.id },
  })
  const orderId = payment?.payment_collection?.order?.id
  if (!orderId) {
    return
  }
  await adjustSellerCommissionWorkflow(container).run({
    input: { order_id: orderId, kind: "refunded" },
  })
}

export const config: SubscriberConfig = { event: "payment.refunded" }
