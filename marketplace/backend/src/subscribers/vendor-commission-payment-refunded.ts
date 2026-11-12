import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { flagRefundedParent } from "../workflows/marketplace/refund-review"

// A refund on a parent order flags its vendor commissions for review at once
// (owner, F-078). payment.refunded carries the payment's id; its payment
// collection leads to the order (MEDUSA_SKILL §7, as Reseller). The payout
// job checks again, so a missed event only delays the flag.
export default async function vendorCommissionPaymentRefunded({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const {
    data: [payment],
  } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "payment",
    fields: ["id", "payment_collection.order.id"],
    filters: { id: data.id },
  })
  const orderId = payment?.payment_collection?.order?.id
  if (orderId) {
    await flagRefundedParent(container, orderId)
  }
}

export const config: SubscriberConfig = { event: "payment.refunded" }
