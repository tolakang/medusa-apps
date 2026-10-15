// Browser → this app's /api/pos proxy (TASKS P2-10). A 401 means the cashier
// was signed out (token expired, account deactivated): go back to sign-in.

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

export async function api<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, string> } = {}
): Promise<T> {
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : ""
  let res: Response
  try {
    res = await fetch(`/api/pos/${path}${qs}`, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    })
  } catch {
    throw new ApiError("No connection to the shop server. Check the Wi-Fi and try again.", 0)
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    window.location.assign("/login")
  }
  if (!res.ok) {
    throw new ApiError((data as { message?: string }).message || `Request failed (${res.status}).`, res.status)
  }
  return data as T
}

// Shapes of the /pos routes the till uses (backend P2-06).
export type Register = {
  id: string
  name: string
  code: string
  stock_location: { id: string; name: string } | null
  sales_channel: { id: string; name: string } | null
  open_shift: Shift | null
}

export type Shift = {
  id: string
  register_id: string
  status: "open" | "closed"
  currency_code: string
  opened_by: string
  opened_at: string
  opening_cash: number | string
  expected_cash?: number | string | null
  counted_cash?: number | string | null
}

export type LookupVariant = {
  id: string
  title: string | null
  sku: string | null
  barcode: string | null
  price: number | null
  currency_code: string
  product: { id: string; title: string | null; thumbnail: string | null }
}

export type Customer = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
}

export type ReceiptOrder = {
  id: string
  display_id: number
  created_at: string
  currency_code: string
  subtotal: number
  discount_total: number
  tax_total: number
  total: number
  items: {
    id: string
    title: string
    variant_title: string | null
    variant_sku: string | null
    quantity: number
    unit_price: number
    total: number
  }[]
}

export type PaymentMethod = "cash" | "card" | "qr"
