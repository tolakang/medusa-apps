import {
  adjustCommission,
  commissionAmount,
  commissionRateFor,
  defaultCommissionRate,
} from "../../modules/seller/commission"

// TASKS P5-04: commission rates, amounts and adjustments.

describe("commission rate", () => {
  it("is the seller's own, else the shop default", () => {
    expect(commissionRateFor({ commission_rate: 12.5 }, {})).toEqual(12.5)
    expect(commissionRateFor({ commission_rate: 0 }, {})).toEqual(0)
    expect(
      commissionRateFor({ commission_rate: null }, { RESELLER_DEFAULT_COMMISSION_RATE: "7" })
    ).toEqual(7)
  })

  it.each([undefined, "", "abc", "-1", "101"])(
    "falls back to 10 for RESELLER_DEFAULT_COMMISSION_RATE=%p",
    (raw) => {
      expect(defaultCommissionRate({ RESELLER_DEFAULT_COMMISSION_RATE: raw })).toEqual(10)
    }
  )
})

describe("commission amount", () => {
  it.each([
    [200, 10, 20],
    [99.99, 12.5, 12.5],
    [33.33, 10, 3.33],
    [100, 0, 0],
    [0, 10, 0],
    [-5, 10, 0],
  ])("%p at %p%% is %p", (base, rate, amount) => {
    expect(commissionAmount(base, rate)).toEqual(amount)
  })
})

describe("adjust on cancel or refund", () => {
  const pending = { status: "pending", order_total: 200, rate: 10, amount: 20 }

  it("a cancelled order cancels a pending or approved commission", () => {
    expect(adjustCommission(pending, { kind: "canceled" })).toEqual({ action: "cancel" })
    expect(
      adjustCommission({ ...pending, status: "approved" }, { kind: "canceled" })
    ).toEqual({ action: "cancel" })
  })

  it("a partial refund recalculates on what the shop kept", () => {
    expect(adjustCommission(pending, { kind: "refunded", refunded_total: 50 })).toEqual({
      action: "amount",
      amount: 15,
    })
  })

  it("a full refund cancels it", () => {
    expect(adjustCommission(pending, { kind: "refunded", refunded_total: 200 })).toEqual({
      action: "cancel",
    })
  })

  it("leaves paid and cancelled commissions alone", () => {
    expect(adjustCommission({ ...pending, status: "paid" }, { kind: "canceled" })).toEqual({
      action: "none",
      reason: "already paid out",
    })
    expect(
      adjustCommission({ ...pending, status: "cancelled" }, { kind: "refunded", refunded_total: 1 })
    ).toEqual({ action: "none", reason: "already cancelled" })
  })

  it("changes nothing when the refund is 0", () => {
    expect(adjustCommission(pending, { kind: "refunded", refunded_total: 0 })).toEqual({
      action: "none",
      reason: "unchanged",
    })
  })
})
