import { MathBN } from "@medusajs/framework/utils"

// TASKS P5-05 (plan §6.5: monthly payout batch, RESELLER_PAYOUT_DAY). Pure.

/** Day of the month the batch runs: RESELLER_PAYOUT_DAY, 1 to 28 (every month has it), else 1. */
export function payoutDay(env: Record<string, string | undefined> = process.env) {
  const day = Number(env.RESELLER_PAYOUT_DAY)
  return Number.isInteger(day) && day >= 1 && day <= 28 ? day : 1
}

export const isPayoutDay = (
  now: Date,
  env: Record<string, string | undefined> = process.env
) => now.getUTCDate() === payoutDay(env)

/** Commissions recorded before this moment (the 1st of now's month, UTC) are due. */
export const payoutCutoff = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

export type DueLine = {
  seller_id: string
  currency_code: string
  amount: number
  count: number
}

/** What each seller is owed, per currency, from a list of commissions. */
export function summarizeBySeller(
  commissions: { seller_id: string; currency_code: string; amount: number | string }[]
): DueLine[] {
  const lines = new Map<string, DueLine>()
  for (const commission of commissions) {
    const key = `${commission.seller_id}:${commission.currency_code}`
    const line = lines.get(key) ?? {
      seller_id: commission.seller_id,
      currency_code: commission.currency_code,
      amount: 0,
      count: 0,
    }
    line.amount = MathBN.convert(MathBN.add(line.amount, commission.amount), 2).toNumber()
    line.count += 1
    lines.set(key, line)
  }
  return [...lines.values()].sort(
    (a, b) => a.seller_id.localeCompare(b.seller_id) || a.currency_code.localeCompare(b.currency_code)
  )
}
