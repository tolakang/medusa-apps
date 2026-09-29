import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  sendNotificationsStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import {
  ORDER_PLACED_STAFF_TEMPLATE,
  ORDER_PLACED_TEMPLATE,
} from "../lib/order-notification"

// Order placed → confirmation email to the customer (channel "email", Resend)
// and an alert to the staff group (channel "telegram"). TASKS D2, P1-04.
// Retry-safe: the Notification Module skips a notification whose
// idempotency_key already succeeded and retries one that failed
// (@medusajs/notification createNotifications). Sent notifications cannot be
// undone, so there is no compensation (core-flows sendNotificationsStep).
export const notifyOrderPlacedWorkflow = createWorkflow(
  "notify-order-placed",
  function (input: { id: string }) {
    const { data: orders } = useQueryGraphStep({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "no_notification",
        "currency_code",
        "total",
        "items.title",
        "items.variant_title",
        "items.quantity",
        "items.total",
        "shipping_address.first_name",
        "shipping_address.last_name",
        "shipping_address.address_1",
        "shipping_address.city",
        "shipping_address.province",
        "shipping_address.phone",
        "shipping_methods.name",
        "metadata",
      ],
      filters: { id: input.id },
      options: { throwIfKeyNotFound: true },
    })

    const notifications = transform({ orders }, ({ orders }) => {
      const order = orders[0]
      const common = {
        data: { order },
        trigger_type: "order.placed",
        resource_id: order.id,
        resource_type: "order",
      }
      return [
        // The customer email respects the order's no_notification flag.
        ...(order.email && !order.no_notification
          ? [
              {
                ...common,
                to: order.email,
                channel: "email",
                template: ORDER_PLACED_TEMPLATE,
                idempotency_key: `order-placed:email:${order.id}`,
                // Also sent to Resend as its Idempotency-Key header.
                provider_data: { idempotency_key: `order-placed:email:${order.id}` },
              },
            ]
          : []),
        {
          ...common,
          // The Telegram provider always posts to its configured staff chat.
          to: "staff",
          channel: "telegram",
          template: ORDER_PLACED_STAFF_TEMPLATE,
          idempotency_key: `order-placed:telegram:${order.id}`,
        },
      ]
    })

    const sent = sendNotificationsStep(notifications)
    return new WorkflowResponse(sent)
  }
)
