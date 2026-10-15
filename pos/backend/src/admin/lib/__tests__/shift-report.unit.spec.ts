import {
  dateRange,
  dayKey,
  formatMoney,
  formatVariance,
  groupShifts,
  type ReportShift,
} from "../shift-report"

// TASKS P2-07: the admin shift report's grouping and formatting.

const shift = (over: Partial<ReportShift>): ReportShift => ({
  id: "pshift_1",
  status: "closed",
  currency_code: "usd",
  opened_by: "pcash_a",
  opened_by_name: "Sokha",
  closed_by_name: "Sokha",
  opened_at: "2026-10-15T02:00:00.000Z",
  closed_at: "2026-10-15T10:00:00.000Z",
  opening_cash: 20,
  counted_cash: 100,
  expected_cash: 100,
  variance: 0,
  notes: null,
  register: { id: "preg_1", name: "Till 1", code: "PP-1" },
  ...over,
})

describe("shift report (TASKS P2-07)", () => {
  it("groups per register with totals of closed shifts and counts open ones", () => {
    const rows = groupShifts(
      [
        shift({ id: "a", expected_cash: 77.5, counted_cash: 76, variance: -1.5 }),
        shift({ id: "b", expected_cash: 0.1, counted_cash: 0.3, variance: 0.2 }),
        shift({ id: "c", status: "open", counted_cash: null, expected_cash: null, variance: null }),
        shift({ id: "d", register: { id: "preg_2", name: "Annex", code: "PP-2" } }),
      ],
      "register"
    )
    expect(rows.map((r) => r.label)).toEqual(["Annex", "Till 1"])
    const till = rows[1]
    expect(till).toEqual(
      expect.objectContaining({ shifts: 3, open: 1, expected: 77.6, counted: 76.3, variance: -1.3, mismatched: 2 })
    )
  })

  it("shows no totals for a group with only open shifts", () => {
    const [row] = groupShifts(
      [shift({ status: "open", counted_cash: null, expected_cash: null, variance: null })],
      "register"
    )
    expect(row).toEqual(expect.objectContaining({ shifts: 1, open: 1, expected: null, counted: null, variance: null }))
  })

  it("never adds two currencies together", () => {
    const rows = groupShifts(
      [shift({ currency_code: "usd" }), shift({ currency_code: "khr", expected_cash: 40000, counted_cash: 40000 })],
      "cashier"
    )
    expect(rows.map((r) => [r.label, r.currency_code, r.expected])).toEqual([
      ["Sokha", "khr", 40000],
      ["Sokha", "usd", 100],
    ])
  })

  it("groups per day in the shop's time zone, newest first", () => {
    // 2026-10-14 20:00 UTC is already the 15th in Phnom Penh (UTC+7).
    const rows = groupShifts(
      [
        shift({ id: "late", opened_at: "2026-10-14T20:00:00.000Z" }),
        shift({ id: "next", opened_at: "2026-10-16T03:00:00.000Z" }),
        shift({ id: "same", opened_at: "2026-10-15T03:00:00.000Z" }),
      ],
      "day",
      "Asia/Phnom_Penh"
    )
    expect(rows.map((r) => [r.label, r.shifts])).toEqual([
      ["2026-10-16", 1],
      ["2026-10-15", 2],
    ])
    expect(dayKey("2026-10-14T20:00:00.000Z", "UTC")).toEqual("2026-10-14")
  })

  it("falls back to the cashier id and an unknown register", () => {
    const rows = groupShifts([shift({ opened_by_name: null, register: null })], "cashier")
    expect(rows[0].label).toEqual("pcash_a")
    expect(groupShifts([shift({ register: null })], "register")[0].label).toEqual("Unknown register")
  })

  it("formats money and signed variances", () => {
    expect(formatMoney(12.5, "usd")).toEqual("$12.50")
    expect(formatMoney(null, "usd")).toEqual("–")
    expect(formatVariance(-1.5, "usd")).toEqual("−$1.50")
    expect(formatVariance(2, "usd")).toEqual("+$2.00")
    expect(formatVariance(0, "usd")).toEqual("$0.00")
    expect(formatVariance(null, "usd")).toEqual("–")
    expect(formatMoney(5, "zz")).toContain("ZZ")
  })

  it("turns picked days into an inclusive from/to range", () => {
    const { from, to } = dateRange("2026-10-01", "2026-10-15")
    expect(new Date(from!).getTime()).toBeLessThan(new Date(to!).getTime())
    expect(new Date(to!).getTime() - new Date(from!).getTime()).toBeGreaterThanOrEqual(14.9 * 24 * 3600 * 1000)
    expect(dateRange("", "")).toEqual({})
  })
})
