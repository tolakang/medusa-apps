import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  ORDER_CANCELED_CUSTOMER_TEMPLATE,
  ORDER_DELIVERED_CUSTOMER_TEMPLATE,
  ORDER_SHIPPED_CUSTOMER_TEMPLATE,
} from "../lib/order-notification"
import { notifyTelegramCustomersWorkflow } from "../workflows/telegram-customer"

// Order updates to customers who follow the order on Telegram (TASKS P1-17).
// Payloads (@medusajs/utils 2.21.1 event docs): shipment.created and
// delivery.created { id: fulfillment ID, no_notification? }, order.canceled
// { id: order ID }. A fulfillment's order comes from the core order-fulfillment
// link (field alias `order` on fulfillment).
const TEMPLATES: Record<string, string> = {
  "shipment.created": ORDER_SHIPPED_CUSTOMER_TEMPLATE,
  "delivery.created": ORDER_DELIVERED_CUSTOMER_TEMPLATE,
  "order.canceled": ORDER_CANCELED_CUSTOMER_TEMPLATE,
}

export default async function telegramCustomerUpdates({
  event: { name, data },
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  const template = TEMPLATES[name]
  if (!template || data.no_notification) {
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

  await notifyTelegramCustomersWorkflow(container).run({ input: { order_id: orderId, template } })
}

export const config: SubscriberConfig = {
  event: Object.keys(TEMPLATES),
}
