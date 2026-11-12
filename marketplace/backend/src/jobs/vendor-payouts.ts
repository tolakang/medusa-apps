import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  isPayoutDay,
  payoutCutoff,
  payoutDay,
  payoutPeriod,
} from "../lib/vendor-commission"
import { createVendorPayoutsWorkflow } from "../workflows/marketplace/create-payouts"

// Daily at 02:00 UTC (09:00 Cambodia), on the worker (TASKS P6-06). Only on
// MARKETPLACE_PAYOUT_DAY does it make last month's vendor payouts; the admin
// pays each one outside Medusa and records it (POST
// /admin/vendor-payouts/:id/pay). Running twice on the day changes nothing.
export default async function vendorPayouts(container: MedusaContainer) {
  const now = new Date()
  if (!isPayoutDay(now)) {
    return
  }
  const { result } = await createVendorPayoutsWorkflow(container).run({
    input: { cutoff: payoutCutoff(now), period: payoutPeriod(now) },
  })
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(
      `Vendor payout day ${payoutDay()} (${payoutPeriod(now)}): ${result.length} payouts` +
        (result.length
          ? `: ${result.map((p) => `${p.vendor_id} ${p.amount} ${p.currency_code} (${p.count})`).join(", ")}`
          : "")
    )
}

export const config = {
  name: "vendor-payouts",
  schedule: "0 2 * * *",
}
