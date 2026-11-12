import {
  commissionAmount,
  commissionBase,
  commissionRateFor,
  defaultCommissionRate,
  groupPayouts,
  isPayoutDay,
  payoutCutoff,
  payoutDay,
  payoutPeriod,
  vendorPayoutAmount,
} from "../vendor-commission"

// TASKS P6-06: commission and payout rules.
describe("vendor commission rules", () => {
  it("reads the default rate, else 10", () => {
    expect(defaultCommissionRate({})).toBe(10)
    expect(defaultCommissionRate({ MARKETPLACE_DEFAULT_COMMISSION_RATE: "12.5" })).toBe(12.5)
    expect(defaultCommissionRate({ MARKETPLACE_DEFAULT_COMMISSION_RATE: "101" })).toBe(10)
    expect(defaultCommissionRate({ MARKETPLACE_DEFAULT_COMMISSION_RATE: " " })).toBe(10)
  })

  it("uses the vendor's own rate first", () => {
    expect(commissionRateFor({ commission_rate: 0 }, {})).toBe(0)
    expect(commissionRateFor({ commission_rate: null }, { MARKETPLACE_DEFAULT_COMMISSION_RATE: "8" })).toBe(8)
  })

  it("takes the commission on items after discounts, without tax", () => {
    expect(commissionBase({ item_total: 110, item_tax_total: 10 })).toBe(100)
    expect(commissionBase({ item_total: 5, item_tax_total: 10 })).toBe(0)
    expect(commissionAmount(100, 12.5)).toBe(12.5)
    expect(commissionAmount(33.33, 10)).toBe(3.33)
    expect(commissionAmount(0, 10)).toBe(0)
  })

  it("owes the vendor the order total minus the commission", () => {
    expect(vendorPayoutAmount(115.5, 10)).toBe(105.5)
    expect(vendorPayoutAmount(5, 10)).toBe(0)
  })

  it("pays on MARKETPLACE_PAYOUT_DAY for the month before", () => {
    expect(payoutDay({})).toBe(1)
    expect(payoutDay({ MARKETPLACE_PAYOUT_DAY: "15" })).toBe(15)
    expect(payoutDay({ MARKETPLACE_PAYOUT_DAY: "31" })).toBe(1)
    const day = new Date("2026-12-15T02:00:00Z")
    expect(isPayoutDay(day, { MARKETPLACE_PAYOUT_DAY: "15" })).toBe(true)
    expect(isPayoutDay(day, {})).toBe(false)
    expect(payoutCutoff(day).toISOString()).toBe("2026-12-01T00:00:00.000Z")
    expect(payoutPeriod(day)).toBe("2026-11")
    expect(payoutPeriod(new Date("2027-01-01T00:00:00Z"))).toBe("2026-12")
  })

  it("groups commissions into one payout per vendor and currency", () => {
    expect(
      groupPayouts([
        { id: "c1", vendor_id: "v2", currency_code: "usd", payout_amount: 10.1 },
        { id: "c2", vendor_id: "v1", currency_code: "usd", payout_amount: 5 },
        { id: "c3", vendor_id: "v2", currency_code: "usd", payout_amount: 0.2 },
        { id: "c4", vendor_id: "v2", currency_code: "khr", payout_amount: 4000 },
      ])
    ).toEqual([
      { vendor_id: "v1", currency_code: "usd", amount: 5, commission_ids: ["c2"] },
      { vendor_id: "v2", currency_code: "khr", amount: 4000, commission_ids: ["c4"] },
      { vendor_id: "v2", currency_code: "usd", amount: 10.3, commission_ids: ["c1", "c3"] },
    ])
  })
})
