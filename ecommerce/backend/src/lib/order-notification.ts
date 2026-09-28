// Shared by the email (Resend) and staff (Telegram) notification templates.

export const ORDER_PLACED_TEMPLATE = "order-placed"
export const ORDER_PLACED_STAFF_TEMPLATE = "order-placed-staff"

export type OrderNotificationData = {
  display_id?: number | string | null
  email?: string | null
  currency_code?: string | null
  total?: number | null
  items?: ({
    title?: string | null
    variant_title?: string | null
    quantity?: number | null
    total?: number | null
  } | null)[] | null
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    address_1?: string | null
    city?: string | null
    phone?: string | null
  } | null
  shipping_methods?: ({ name?: string | null } | null)[] | null
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Medusa v2 amounts are in the currency's main unit (e.g. 15 = $15.00).
export function formatMoney(amount: unknown, currencyCode?: string | null) {
  const value = Number(amount ?? 0)
  const currency = (currencyCode || "usd").toUpperCase()
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value)
  } catch {
    return `${value} ${currency}`
  }
}

// "Medusa T-Shirt (L / White)", so staff can tell variants apart (size and
// colour). Products without options get the dashboard's "Default variant"
// title (@medusajs/dashboard 2.21.1 product create), which says nothing.
export function itemLabel(item: { title?: string | null; variant_title?: string | null }) {
  const title = item.title || "item"
  const variant = item.variant_title?.trim()
  return variant && variant.toLowerCase() !== "default variant" && variant !== title
    ? `${title} (${variant})`
    : title
}
