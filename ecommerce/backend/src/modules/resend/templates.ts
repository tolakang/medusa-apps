// Email templates for the Resend provider. The workflow passes `data.order`
// (fields selected in src/workflows/notify-order-placed.ts).
import {
  addressLine,
  escapeHtml,
  formatMoney,
  itemLabel,
  ORDER_PLACED_TEMPLATE,
  type OrderNotificationData,
} from "../../lib/order-notification"

function orderPlaced(order: OrderNotificationData) {
  const rows = (order.items ?? [])
    .filter(Boolean)
    .map(
      (item) =>
        `<tr><td>${escapeHtml(itemLabel(item!))}</td>` +
        `<td style="text-align:center">${escapeHtml(item!.quantity)}</td>` +
        `<td style="text-align:right">${escapeHtml(formatMoney(item!.total, order.currency_code))}</td></tr>`
    )
    .join("")
  const address = order.shipping_address
  const name = [address?.first_name, address?.last_name].filter(Boolean).join(" ")
  const delivery = (order.shipping_methods ?? [])
    .map((method) => method?.name)
    .filter(Boolean)
    .join(", ")

  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>Thank you for your order${name ? `, ${escapeHtml(name)}` : ""}!</h2>
<p>Order <strong>#${escapeHtml(order.display_id)}</strong> has been placed.</p>
<table style="border-collapse:collapse;width:100%;max-width:560px" cellpadding="6">
<thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Total</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="2"><strong>Order total</strong></td><td style="text-align:right"><strong>${escapeHtml(formatMoney(order.total, order.currency_code))}</strong></td></tr></tfoot>
</table>
${delivery ? `<p>Delivery: ${escapeHtml(delivery)}</p>` : ""}
${address?.address_1 ? `<p>Ship to: ${escapeHtml(addressLine(address))}</p>` : ""}
</body></html>`

  return {
    subject: `Order #${order.display_id ?? ""} confirmed`,
    html,
  }
}

export function renderEmail(
  template: string | null | undefined,
  data: Record<string, unknown> | null | undefined
): { subject: string; html: string } | null {
  if (template === ORDER_PLACED_TEMPLATE) {
    return orderPlaced((data?.order ?? {}) as OrderNotificationData)
  }
  return null
}
