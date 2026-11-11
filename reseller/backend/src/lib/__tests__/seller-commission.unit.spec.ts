import { adjustCommission, commissionAmount, commissionBase, commissionRateFor, defaultCommissionRate } from "../../modules/seller/commission"

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

  // P5-12: the base is the items; a refund is of the whole order (items,
  // shipping, tax), so the commission keeps the share the shop kept.
  it("a refund of part of the whole order keeps that share of the item base", () => {
    // Items 200 of an order of 250 (shipping and tax 50); 125 refunded = half.
    expect(
      adjustCommission(pending, { kind: "refunded", refunded_total: 125, order_grand_total: 250 })
    ).toEqual({ action: "amount", amount: 10 })
    expect(
      adjustCommission(pending, { kind: "refunded", refunded_total: 250, order_grand_total: 250 })
    ).toEqual({ action: "cancel" })
  })

  it("changes nothing when the refund is 0", () => {
    expect(adjustCommission(pending, { kind: "refunded", refunded_total: 0 })).toEqual({
      action: "none",
      reason: "unchanged",
    })
  })
})

describe("commission base (D11, TASKS P5-12)", () => {
  it("is the items after discounts, without tax and shipping", () => {
    // item_total is after discounts with tax.
    expect(commissionBase({ item_total: 110, item_tax_total: 10 })).toEqual(100)
    expect(commissionBase({ item_total: 33.335, item_tax_total: 0 })).toEqual(33.34)
    expect(commissionBase({ item_total: 0, item_tax_total: 0 })).toEqual(0)
    expect(commissionBase({})).toEqual(0)
  })
})
