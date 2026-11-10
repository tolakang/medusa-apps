import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isPayoutDay, payoutCutoff, payoutDay } from "../modules/seller/payout"
import { sellerPayoutBatchWorkflow } from "../workflows/seller/payout"

// Daily at 02:00 UTC (09:00 Cambodia), on the worker (TASKS P5-05). Only on
// RESELLER_PAYOUT_DAY does it approve last month's commissions and log what
// each seller is owed; the admin pays and records it (POST
// /admin/sellers/:id/payouts). Running twice on the day changes nothing.
export default async function sellerPayoutBatch(container: MedusaContainer) {
  const now = new Date()
  if (!isPayoutDay(now)) {
    return
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { result } = await sellerPayoutBatchWorkflow(container).run({
    input: { cutoff: payoutCutoff(now) },
  })
  logger.info(
    `Seller payout day ${payoutDay()}: approved ${result.approved} commissions` +
      (result.due.length
        ? `; due ${result.due.map((d) => `${d.seller_id} ${d.amount} ${d.currency_code} (${d.count})`).join(", ")}`
        : "")
  )
}

export const config = {
  name: "seller-payout-batch",
  schedule: "0 2 * * *",
}
