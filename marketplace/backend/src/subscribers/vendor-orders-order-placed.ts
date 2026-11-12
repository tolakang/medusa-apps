import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  PARENT_ORDER_KEY,
  splitVendorOrderWorkflow,
} from "../workflows/marketplace/create-vendor-orders"

// Every placed order gets its vendor child orders, however its cart was
// completed (TASKS P6-08, F-079): the storefront's complete-vendor does it at
// once; this covers a cart completed by Medusa itself, e.g. PayWay's webhook
// when the customer never returns to the storefront. split-vendor-order is
// locked per order and skips an order that already has its children, so the
// two never make two sets. Errors fail the subscriber, so the event bus can
// retry.
export default async function vendorOrdersOrderPlaced({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const {
    data: [order],
  } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "metadata"],
    filters: { id: data.id },
  })
  if (!order || order.metadata?.[PARENT_ORDER_KEY]) {
    return
  }
  await splitVendorOrderWorkflow(container).run({ input: { order_id: order.id } })
}

export const config: SubscriberConfig = { event: "order.placed" }
