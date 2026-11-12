import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import {
  CHILD_ORDERS_KEY,
  PARENT_ORDER_KEY,
} from "../workflows/marketplace/create-vendor-orders"

// Cancelling a customer's (parent) order cancels its vendor child orders
// (review 2, S2). The parent's stock reservations moved to the children at
// the split, so cancelling only the parent left the vendors' units held,
// their orders open to fulfil, and their commissions due. Core's
// cancelOrderWorkflow on each child releases its reservations and emits
// order.canceled for it, which cancels its commission
// (vendor-commission-order-canceled). A child with a fulfilment that isn't
// cancelled can't be cancelled (core refuses): it is logged for the admin.
// Children have no payment, so nothing is refunded twice. Errors on one
// child don't stop the others; the subscriber fails at the end so the event
// bus can retry (an already cancelled child is skipped).
export default async function vendorOrdersOrderCanceled({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const {
    data: [order],
  } = await query.graph({ entity: "order", fields: ["id", "metadata"], filters: { id: data.id } })
  const childIds = (order?.metadata?.[CHILD_ORDERS_KEY] ?? []) as string[]
  if (!order || order.metadata?.[PARENT_ORDER_KEY] || !childIds.length) {
    return
  }
  const { data: children } = await query.graph({
    entity: "order",
    fields: ["id", "status", "fulfillments.id", "fulfillments.canceled_at"],
    filters: { id: childIds },
  })
  const failed: string[] = []
  for (const child of children) {
    if (child.status === "canceled") {
      continue
    }
    const shipped = (child.fulfillments ?? []).some((f) => f && !f.canceled_at)
    if (shipped) {
      logger.warn(
        `Order ${order.id} was cancelled, but its vendor order ${child.id} is already fulfilled: settle it with the vendor (return or cancel the fulfilment first).`
      )
      continue
    }
    try {
      await cancelOrderWorkflow(container).run({ input: { order_id: child.id } })
    } catch (error) {
      failed.push(child.id)
      logger.warn(`Vendor order ${child.id} not cancelled: ${(error as Error).message}`)
    }
  }
  if (failed.length) {
    throw new Error(`Vendor orders not cancelled: ${failed.join(", ")}.`)
  }
}

export const config: SubscriberConfig = { event: "order.canceled" }
