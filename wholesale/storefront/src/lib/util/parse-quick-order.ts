// Quick order (BUILD_PLAN.md §6.4: bulk add by SKU / CSV). One item per
// line: `SKU, quantity`. The separator may be a comma, semicolon, tab or
// spaces; a missing quantity means 1; a header row is skipped; the same SKU
// on several lines is added up.

export type QuickOrderLine = { sku: string; quantity: number }

export type ParsedQuickOrder = {
  lines: QuickOrderLine[]
  // Lines that could not be read, as "line number: text"
  invalid: string[]
}

export const MAX_QUICK_ORDER_LINES = 200

const HEADER = /^(sku|item|product|code)\b/i

export function parseQuickOrder(text: string): ParsedQuickOrder {
  const totals = new Map<string, QuickOrderLine>()
  const invalid: string[] = []

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim()
    if (!line || (index === 0 && HEADER.test(line))) {
      return
    }
    const parts = line
      .split(/[,;\t]|\s+(?=\S+$)/)
      .map((part) => part.trim().replace(/^"(.*)"$/, "$1"))
      .filter(Boolean)
    const [sku, amount] = parts
    const quantity = amount === undefined ? 1 : Number(amount)
    if (!sku || parts.length > 2 || !Number.isInteger(quantity) || quantity < 1) {
      invalid.push(`${index + 1}: ${line}`)
      return
    }
    const key = sku.toLowerCase()
    const existing = totals.get(key)
    totals.set(key, {
      sku: existing?.sku ?? sku,
      quantity: (existing?.quantity ?? 0) + quantity,
    })
  })

  return { lines: [...totals.values()], invalid }
}
