// Plain-text staff messages for the Telegram provider (no parse_mode, so
// customer-entered text needs no escaping).
import {
  formatMoney,
  addressLine,
  itemLabel,
  ORDER_PLACED_STAFF_TEMPLATE,
  type OrderNotificationData,
} from "../../lib/order-notification"

function orderPlacedStaff(order: OrderNotificationData) {
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
    address?.address_1 ? `Address: ${addressLine(address)}` : "",
    delivery ? `Delivery: ${delivery}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

export function renderMessage(
  template: string | null | undefined,
  data: Record<string, unknown> | null | undefined
): string | null {
  if (template === ORDER_PLACED_STAFF_TEMPLATE) {
    return orderPlacedStaff((data?.order ?? {}) as OrderNotificationData)
  }
  return null
}
