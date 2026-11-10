import {
  isPayoutDay,
  payoutCutoff,
  payoutDay,
  summarizeBySeller,
} from "../../modules/seller/payout"

// TASKS P5-05: payout day, cutoff and totals.

describe("payout day", () => {
  it.each([
    ["1", 1],
    ["15", 15],
    ["28", 28],
    [undefined, 1],
    ["", 1],
    ["0", 1],
    ["29", 1],
    ["31", 1],
    ["2.5", 1],
    ["x", 1],
  ])("RESELLER_PAYOUT_DAY=%p is day %p", (raw, day) => {
    expect(payoutDay({ RESELLER_PAYOUT_DAY: raw })).toEqual(day)
  })

  it("is the matching UTC day of the month", () => {
    const env = { RESELLER_PAYOUT_DAY: "10" }
    expect(isPayoutDay(new Date("2026-11-10T02:00:00Z"), env)).toBe(true)
    expect(isPayoutDay(new Date("2026-11-11T02:00:00Z"), env)).toBe(false)
  })
})

describe("payout cutoff", () => {
  it("is the 1st of the month, so last month's commissions are due", () => {
    expect(payoutCutoff(new Date("2026-11-10T02:00:00Z")).toISOString()).toEqual(
      "2026-11-01T00:00:00.000Z"
    )
    expect(payoutCutoff(new Date("2027-01-01T00:30:00Z")).toISOString()).toEqual(
      "2027-01-01T00:00:00.000Z"
    )
  })
})

describe("totals per seller", () => {
  it("adds up per seller and currency, in cents", () => {
    expect(
      summarizeBySeller([
        { seller_id: "b", currency_code: "usd", amount: 0.1 },
        { seller_id: "a", currency_code: "usd", amount: "1.25" },
        { seller_id: "b", currency_code: "usd", amount: 0.2 },
        { seller_id: "b", currency_code: "khr", amount: 4000 },
      ])
    ).toEqual([
      { seller_id: "a", currency_code: "usd", amount: 1.25, count: 1 },
      { seller_id: "b", currency_code: "khr", amount: 4000, count: 1 },
      { seller_id: "b", currency_code: "usd", amount: 0.3, count: 2 },
    ])
  })
})
