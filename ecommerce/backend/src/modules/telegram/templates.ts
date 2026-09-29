// Plain-text staff and customer messages for the Telegram provider (no
// parse_mode, so customer-entered text needs no escaping).
import {
  formatMoney,
  addressLine,
  itemLabel,
  ORDER_CANCELED_CUSTOMER_TEMPLATE,
  ORDER_CONFIRMED_CUSTOMER_TEMPLATE,
  ORDER_DELIVERED_CUSTOMER_TEMPLATE,
  ORDER_PLACED_STAFF_TEMPLATE,
  ORDER_SHIPPED_CUSTOMER_TEMPLATE,
  type OrderNotificationData,
} from "../../lib/order-notification"
import { TELEGRAM_CONTACT_KEY, telegramContactLabel } from "../../lib/telegram-contact"

function orderPlacedStaff(order: OrderNotificationData) {
  const telegram = telegramContactLabel(order.metadata?.[TELEGRAM_CONTACT_KEY])
  const address = order.shipping_address
  const name = [address?.first_name, address?.last_name].filter(Boolean).join(" ")
  const items = (order.items ?? [])
    .filter(Boolean)
    .map((item) => `• ${item!.quantity ?? 1} × ${itemLabel(item!)}`)
  const delivery = (order.shipping_methods ?? [])
    .map((method) => method?.name)
    .filter(Boolean)
    .join(", ")

  return [
    `🛒 New order #${order.display_id ?? "?"} — ${formatMoney(order.total, order.currency_code)}`,
    ...items,
    name || order.email ? `Customer: ${[name, order.email].filter(Boolean).join(", ")}` : "",
    address?.phone ? `Phone: ${address.phone}` : "",
    telegram ? `Telegram: ${telegram.url ?? telegram.text}` : "",
    address?.address_1 ? `Address: ${addressLine(address)}` : "",
    delivery ? `Delivery: ${delivery}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

// Customer messages from the customer bot (TASKS P1-17).
function orderConfirmedCustomer(order: OrderNotificationData) {
  const address = order.shipping_address
  const items = (order.items ?? [])
    .filter(Boolean)
    .map((item) => `• ${item!.quantity ?? 1} × ${itemLabel(item!)}`)
  const delivery = (order.shipping_methods ?? [])
    .map((method) => method?.name)
    .filter(Boolean)
    .join(", ")

  return [
    `✅ Order #${order.display_id ?? "?"} confirmed — ${formatMoney(order.total, order.currency_code)}`,
    ...items,
    address?.address_1 ? `Deliver to: ${addressLine(address)}` : "",
    delivery ? `Delivery: ${delivery}` : "",
    "You will get a message here when your order ships. Thank you!",
  ]
    .filter(Boolean)
    .join("\n")
}

const statusMessages: Record<string, (order: OrderNotificationData) => string> = {
  [ORDER_CONFIRMED_CUSTOMER_TEMPLATE]: orderConfirmedCustomer,
  [ORDER_SHIPPED_CUSTOMER_TEMPLATE]: (order) =>
    `🚚 Order #${order.display_id ?? "?"} is on its way.`,
  [ORDER_DELIVERED_CUSTOMER_TEMPLATE]: (order) =>
    `📦 Order #${order.display_id ?? "?"} has been delivered. Thank you for shopping with us!`,
  [ORDER_CANCELED_CUSTOMER_TEMPLATE]: (order) =>
    `Order #${order.display_id ?? "?"} has been canceled. Contact us if you have any questions.`,
}

export const TELEGRAM_START_HELP_TEMPLATE = "telegram-start-help"
const START_HELP =
  "Hello! To get updates about an order, open your order confirmation page and tap “Get order updates on Telegram”."

export function renderMessage(
  template: string | null | undefined,
  data: Record<string, unknown> | null | undefined
): string | null {
  if (template === ORDER_PLACED_STAFF_TEMPLATE) {
    return orderPlacedStaff((data?.order ?? {}) as OrderNotificationData)
  }
  if (template === TELEGRAM_START_HELP_TEMPLATE) {
    return START_HELP
  }
  const customer = template ? statusMessages[template] : undefined
  return customer ? customer((data?.order ?? {}) as OrderNotificationData) : null
}
