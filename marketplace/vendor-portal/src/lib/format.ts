// TASKS P6-09: display helpers and form parsing (pure, tested in
// __tests__/format.test.ts).

export function money(amount: number | string | null | undefined, currency: string): string {
  const value = Number(amount ?? 0)
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`
  }
}

export function day(value: string | Date | null | undefined): string {
  if (!value) {
    return ""
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10)
}

export const PRODUCT_STATUSES = ["draft", "proposed"] as const

export type ProductBody = {
  title: string
  description?: string
  status: (typeof PRODUCT_STATUSES)[number]
  options: { title: string; values: string[] }[]
  additional_data?: { stock_quantity: number }
  variants: {
    title: string
    sku?: string
    manage_inventory: boolean
    options: Record<string, string>
    prices: { amount: number; currency_code: string }[]
  }[]
}

/**
 * The new-product form → the body of POST /vendors/products (one variant,
 * one price). A string is the error to show.
 */
export function productBody(form: {
  title?: string
  description?: string
  price?: string
  currency?: string
  sku?: string
  status?: string
  // Stock (owner, F-080): tracked unless the product is made to order.
  track_stock?: boolean
  stock?: string
}): ProductBody | string {
  const title = (form.title ?? "").trim()
  if (!title) {
    return "Give the product a name."
  }
  const price = Number((form.price ?? "").trim())
  if (!Number.isFinite(price) || price <= 0) {
    return "Enter a price above 0, e.g. 12.50."
  }
  const currency = (form.currency ?? "usd").trim().toLowerCase()
  if (!/^[a-z]{3}$/.test(currency)) {
    return "Choose a currency."
  }
  const status = PRODUCT_STATUSES.find((s) => s === form.status) ?? "draft"
  const sku = (form.sku ?? "").trim()
  const track = form.track_stock !== false
  const stockText = (form.stock ?? "").trim()
  const stock = stockText === "" ? 0 : Number(stockText)
  if (track && (!Number.isInteger(stock) || stock < 0)) {
    return "Enter how many you have in stock: a whole number, 0 or more."
  }
  return {
    title,
    ...(form.description?.trim() ? { description: form.description.trim() } : {}),
    status,
    options: [{ title: "Default", values: ["Default"] }],
    variants: [
      {
        title: "Default",
        ...(sku ? { sku } : {}),
        // Tracked: Medusa refuses checkout when it's out of stock, and
        // fulfilling takes it from the vendor's location (F-080).
        manage_inventory: track,
        options: { Default: "Default" },
        prices: [{ amount: Math.round(price * 100) / 100, currency_code: currency }],
      },
    ],
    ...(track ? { additional_data: { stock_quantity: stock } } : {}),
  }
}

/** The stock form's quantity, or the error to show. */
export function stockQuantity(raw: string | undefined): number | string {
  const text = (raw ?? "").trim()
  const n = Number(text)
  return text !== "" && Number.isInteger(n) && n >= 0
    ? n
    : "Enter how many you have in stock: a whole number, 0 or more."
}

/** Items still to fulfil in an order, from the backend's `remaining`. */
export const toFulfil = (remaining: Record<string, number> | undefined) =>
  Object.values(remaining ?? {}).reduce((sum, q) => sum + q, 0)
