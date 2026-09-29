// Shared by the email (Resend) and staff (Telegram) notification templates.

export const ORDER_PLACED_TEMPLATE = "order-placed"
export const ORDER_PLACED_STAFF_TEMPLATE = "order-placed-staff"
// Customer messages on Telegram (P1-17).
export const ORDER_CONFIRMED_CUSTOMER_TEMPLATE = "order-confirmed-customer"
export const ORDER_SHIPPED_CUSTOMER_TEMPLATE = "order-shipped-customer"
export const ORDER_DELIVERED_CUSTOMER_TEMPLATE = "order-delivered-customer"
export const ORDER_CANCELED_CUSTOMER_TEMPLATE = "order-canceled-customer"

// Order fields every notification template may use.
export const ORDER_NOTIFICATION_FIELDS = [
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
]

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
    province?: string | null
    phone?: string | null
  } | null
  shipping_methods?: ({ name?: string | null } | null)[] | null
  metadata?: Record<string, unknown> | null
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

// "#111, St 310, Khan Chamkar Mon, Phnom Penh": street, khan/srok, province.
export function addressLine(address: OrderNotificationData["shipping_address"]) {
  return [address?.address_1, address?.city, address?.province].filter(Boolean).join(", ")
}
