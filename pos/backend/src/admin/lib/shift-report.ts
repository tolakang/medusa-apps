// Shift report (TASKS P2-07): grouping and money formatting for the admin
// page over GET /admin/pos/shifts. Kept free of React so it can be unit
// tested. Amounts stay per currency: a USD shift and a KHR shift are never
// added together.

export type ReportShift = {
  id: string
  status: "open" | "closed"
  currency_code: string
  opened_by: string
  opened_by_name: string | null
  closed_by_name: string | null
  opened_at: string
  closed_at: string | null
  opening_cash: number | string
  counted_cash: number | string | null
  expected_cash: number | string | null
  variance: number | null
  notes: string | null
  register: { id: string; name: string; code: string } | null
}

export type GroupBy = "register" | "cashier" | "day"

export type ReportGroup = {
  key: string
  label: string
  currency_code: string
  shifts: number
  open: number
  // Totals of the closed shifts; null when the group has none yet.
  expected: number | null
  counted: number | null
  variance: number | null
  // Closed shifts whose count didn't match (variance ≠ 0).
  mismatched: number
}

// Money in the report is at most 2 decimals (USD cents; KHR has none).
// Summing in integer hundredths avoids float drift such as 0.1 + 0.2.
const toCents = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100)
const fromCents = (c: number) => c / 100

// The calendar day a shift opened, in the viewer's time zone (the shop's,
// on the shop's computer).
export function dayKey(iso: string, timeZone?: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

function groupOf(shift: ReportShift, by: GroupBy, timeZone?: string): { key: string; label: string } {
  if (by === "register") {
    return { key: shift.register?.id ?? "none", label: shift.register?.name ?? "Unknown register" }
  }
  if (by === "cashier") {
    return { key: shift.opened_by, label: shift.opened_by_name ?? shift.opened_by }
  }
  const day = dayKey(shift.opened_at, timeZone)
  return { key: day, label: day }
}

// One row per group and currency. Expected, counted and variance cover the
// closed shifts only; open shifts are counted in `open`.
export function groupShifts(shifts: ReportShift[], by: GroupBy, timeZone?: string): ReportGroup[] {
  const rows = new Map<string, ReportGroup & { e: number; c: number; v: number }>()
  for (const shift of shifts) {
    const { key, label } = groupOf(shift, by, timeZone)
    const id = `${key}|${shift.currency_code}`
    let row = rows.get(id)
    if (!row) {
      row = {
        key,
        label,
        currency_code: shift.currency_code,
        shifts: 0,
        open: 0,
        expected: 0,
        counted: 0,
        variance: 0,
        mismatched: 0,
        e: 0,
        c: 0,
        v: 0,
      }
      rows.set(id, row)
    }
    row.shifts += 1
    if (shift.status !== "closed") {
      row.open += 1
      continue
    }
    row.e += toCents(shift.expected_cash)
    row.c += toCents(shift.counted_cash)
    const v = toCents(shift.variance)
    row.v += v
    if (v !== 0) {
      row.mismatched += 1
    }
  }
  const result = [...rows.values()].map(({ e, c, v, ...row }) => {
    const hasClosed = row.shifts > row.open
    return {
      ...row,
      expected: hasClosed ? fromCents(e) : null,
      counted: hasClosed ? fromCents(c) : null,
      variance: hasClosed ? fromCents(v) : null,
    }
  })
  // Days newest first; registers and cashiers by name.
  return result.sort((a, b) =>
    by === "day"
      ? b.key.localeCompare(a.key) || a.currency_code.localeCompare(b.currency_code)
      : a.label.localeCompare(b.label) || a.currency_code.localeCompare(b.currency_code)
  )
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

// Variance with its sign spelled out: "+1.50" over, "−1.50" short.
export function formatVariance(amount: number | null, currency: string): string {
  if (amount === null) {
    return "–"
  }
  if (amount === 0) {
    return formatMoney(0, currency)
  }
  return `${amount > 0 ? "+" : "−"}${formatMoney(Math.abs(amount), currency)}`
}

// The report's `from`/`to` query from two dates picked in the admin (YYYY-MM-DD,
// both inclusive, the viewer's local midnight).
export function dateRange(from: string, to: string): { from?: string; to?: string } {
  const range: { from?: string; to?: string } = {}
  if (from) {
    range.from = new Date(`${from}T00:00:00`).toISOString()
  }
  if (to) {
    const end = new Date(`${to}T00:00:00`)
    end.setDate(end.getDate() + 1)
    range.to = end.toISOString()
  }
  return range
}
