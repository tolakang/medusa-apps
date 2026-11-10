import { MathBN } from "@medusajs/framework/utils"

// TASKS P5-04 (plan §6.5): what a seller earns on an order. Pure, so the
// workflows and the unit tests share it.

/** The shop's default rate, percent: RESELLER_DEFAULT_COMMISSION_RATE, else 10 (`.env.example`). */
export function defaultCommissionRate(env: Record<string, string | undefined> = process.env) {
  const raw = env.RESELLER_DEFAULT_COMMISSION_RATE
  const rate = raw === undefined || raw.trim() === "" ? NaN : Number(raw)
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 10
}

/** The seller's own rate, or the shop's default when the seller has none. */
export function commissionRateFor(
  seller: { commission_rate?: number | null },
  env: Record<string, string | undefined> = process.env
) {
  const own = seller.commission_rate
  return own === null || own === undefined ? defaultCommissionRate(env) : Number(own)
}

/** rate percent of the base, rounded to cents, never below 0. */
export function commissionAmount(base: number, rate: number) {
  if (base <= 0 || rate <= 0) {
    return 0
  }
  return MathBN.convert(MathBN.div(MathBN.mult(base, rate), 100), 2).toNumber()
}

export type CommissionAdjustment =
  | { action: "none"; reason: string }
  | { action: "cancel" }
  | { action: "amount"; amount: number }

/**
 * What an order's cancellation or refund does to its commission: nothing to a
 * paid or cancelled one (a paid one is clawed back by the payout, P5-05);
 * a cancelled order cancels it; a refund recalculates it on what the shop
 * kept, and cancels it when nothing is left.
 */
export function adjustCommission(
  commission: { status: string; order_total: number; rate: number; amount: number },
  event: { kind: "canceled" } | { kind: "refunded"; refunded_total: number }
): CommissionAdjustment {
  if (commission.status === "cancelled") {
    return { action: "none", reason: "already cancelled" }
  }
  if (commission.status === "paid") {
    return { action: "none", reason: "already paid out" }
  }
  if (event.kind === "canceled") {
    return { action: "cancel" }
  }
  const kept = Number(commission.order_total) - Number(event.refunded_total)
  if (kept <= 0) {
    return { action: "cancel" }
  }
  const amount = commissionAmount(kept, Number(commission.rate))
  return amount === Number(commission.amount)
    ? { action: "none", reason: "unchanged" }
    : { action: "amount", amount }
}
