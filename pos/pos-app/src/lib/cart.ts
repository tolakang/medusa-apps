// The till's cart (TASKS P2-10). Kept free of React so it can be unit tested
// (`pnpm test`). Prices are what the lookup returned for the shift's currency;
// the backend prices the sale again at checkout (pos-checkout, P2-05), so the
// total shown here is an estimate until the receipt comes back.

export type CartLine = {
  variant_id: string
  title: string
  variant_title: string | null
  sku: string | null
  unit_price: number | null
  quantity: number
}

export type ScannedVariant = {
  id: string
  title: string | null
  sku: string | null
  price: number | null
  product: { title: string | null }
}

export const MAX_QUANTITY = 1000

export function lineFromVariant(v: ScannedVariant): CartLine {
  return {
    variant_id: v.id,
    title: v.product.title ?? v.title ?? v.sku ?? v.id,
    variant_title: v.title && v.title !== v.product.title ? v.title : null,
    sku: v.sku,
    unit_price: v.price,
    quantity: 1,
  }
}

// Scanning the same item again adds one to its line.
export function addLine(cart: CartLine[], line: CartLine): CartLine[] {
  const existing = cart.find((l) => l.variant_id === line.variant_id)
  if (!existing) {
    return [...cart, line]
  }
  return setQuantity(cart, line.variant_id, existing.quantity + line.quantity)
}

// Quantity 0 removes the line.
export function setQuantity(cart: CartLine[], variantId: string, quantity: number): CartLine[] {
  const q = Math.min(MAX_QUANTITY, Math.max(0, Math.floor(quantity)))
  if (q === 0) {
    return cart.filter((l) => l.variant_id !== variantId)
  }
  return cart.map((l) => (l.variant_id === variantId ? { ...l, quantity: q } : l))
}

// Integer hundredths, so 0.1 + 0.2 = 0.3.
const cents = (v: number) => Math.round(v * 100)

export function lineTotal(line: CartLine): number | null {
  return line.unit_price === null ? null : (cents(line.unit_price) * line.quantity) / 100
}

export function cartTotal(cart: CartLine[]): number {
  return cart.reduce((sum, l) => sum + cents(l.unit_price ?? 0) * l.quantity, 0) / 100
}

export function itemCount(cart: CartLine[]): number {
  return cart.reduce((n, l) => n + l.quantity, 0)
}

export function checkoutItems(cart: CartLine[]): { variant_id: string; quantity: number }[] {
  return cart.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity }))
}

// Cash: the change to hand back, or null while the tendered amount is short.
export function changeDue(total: number, tendered: number): number | null {
  if (!Number.isFinite(tendered) || cents(tendered) < cents(total)) {
    return null
  }
  return (cents(tendered) - cents(total)) / 100
}

// Quick cash buttons: the exact amount, then the next round notes above it.
export function quickTender(total: number, notes: number[] = [1, 5, 10, 20, 50, 100]): number[] {
  const amounts = new Set<number>([total])
  for (const note of notes) {
    const rounded = Math.ceil(cents(total) / cents(note)) * note
    if (rounded > total) {
      amounts.add(rounded)
    }
  }
  return [...amounts].sort((a, b) => a - b).slice(0, 4)
}

export function formatMoney(amount: number | string | null | undefined, currency: string): string {
  if (amount === null || amount === undefined || amount === "") {
    return "–"
  }
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
      Number(amount)
    )
  } catch {
    return `${Number(amount).toFixed(2)} ${currency.toUpperCase()}`
  }
}
