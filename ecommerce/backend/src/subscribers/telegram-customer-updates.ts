import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { OrderStatusUpdate } from "../lib/order-notification"
import { notifyOrderStatusWorkflow } from "../workflows/telegram-customer"

// Order shipped / delivered / canceled → staff group alert (owner, 2026-09-29)
// and messages to customers who follow the order on Telegram (TASKS P1-17).
// Payloads (@medusajs/utils 2.21.1 event docs): shipment.created and
// delivery.created { id: fulfillment ID, no_notification? }, order.canceled
// { id: order ID }. A fulfillment's order comes from the core order-fulfillment
// link (field alias `order` on fulfillment). no_notification only silences the
// customer; staff are always told.
const STATUS: Record<string, OrderStatusUpdate> = {
  "shipment.created": "shipped",
  "delivery.created": "delivered",
  "order.canceled": "canceled",
}

export default async function orderStatusUpdates({
  event: { name, data },
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  const status = STATUS[name]
  if (!status) {
    return
  }

  let orderId: string | undefined = data.id
  if (name !== "order.canceled") {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [fulfillment],
    } = await query.graph({ entity: "fulfillment", fields: ["order.id"], filters: { id: data.id } })
    orderId = (fulfillment as { order?: { id?: string } } | undefined)?.order?.id
  }
  if (!orderId) {
    return
  }

  await notifyOrderStatusWorkflow(container).run({
    input: {
      order_id: orderId,
      status,
      notify_customer: !data.no_notification,
      // Shipped and delivered come per fulfillment (parcel); canceled per order.
      fulfillment_id: name === "order.canceled" ? undefined : data.id,
    },
  })
}

export const config: SubscriberConfig = {
  event: Object.keys(STATUS),
}
