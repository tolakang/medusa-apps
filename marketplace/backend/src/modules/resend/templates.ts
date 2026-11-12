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
import {
  type AuthEmailData,
  PASSWORD_CHANGED_TEMPLATE,
  PASSWORD_RESET_TEMPLATE,
  VERIFY_EMAIL_TEMPLATE,
} from "../../lib/auth-email"

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

// Account emails (TASKS P1-18): one button with the link, the link as text
// for mail apps that hide buttons, and when it expires.
function accountEmail(subject: string, intro: string, action: string, data: AuthEmailData) {
  const url = escapeHtml(data.url)
  const expires = data.expires_minutes
    ? `<p>This link works once and expires in ${escapeHtml(data.expires_minutes)} minutes.</p>`
    : `<p>This link works once.</p>`
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>${escapeHtml(subject)}</h2>
<p>${escapeHtml(intro)}</p>
<p><a href="${url}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escapeHtml(action)}</a></p>
<p style="font-size:13px;color:#555">Or open this link: <a href="${url}">${url}</a></p>
${expires}
<p style="font-size:13px;color:#555">If you didn't ask for this, ignore this email. Nothing changes.</p>
</body></html>`
  return { subject, html }
}

export function renderEmail(
  template: string | null | undefined,
  data: Record<string, unknown> | null | undefined
): { subject: string; html: string } | null {
  if (template === ORDER_PLACED_TEMPLATE) {
    return orderPlaced((data?.order ?? {}) as OrderNotificationData)
  }
  const auth = data as AuthEmailData | null | undefined
  if (template === VERIFY_EMAIL_TEMPLATE && auth?.url) {
    return accountEmail(
      "Confirm your email",
      "Thanks for creating an account. Confirm your email address to activate it.",
      "Confirm email",
      auth
    )
  }
  if (template === PASSWORD_RESET_TEMPLATE && auth?.url) {
    return accountEmail(
      "Reset your password",
      "We received a request to reset the password of your account.",
      "Choose a new password",
      auth
    )
  }
  if (template === PASSWORD_CHANGED_TEMPLATE) {
    return passwordChanged(auth?.url)
  }
  return null
}

// After a signed-in customer changes their password (no secret in the link).
function passwordChanged(forgotUrl: string | undefined) {
  const subject = "Your password was changed"
  const link = forgotUrl
    ? `<p>If you didn't change it, <a href="${escapeHtml(forgotUrl)}">reset your password now</a> to secure your account.</p>`
    : `<p>If you didn't change it, use "Forgot password?" on the sign-in page to secure your account.</p>`
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>${subject}</h2>
<p>The password of your account was just changed.</p>
${link}
</body></html>`
  return { subject, html }
}
