import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { summarizeBySeller } from "../../modules/seller/payout"
import { approveDueCommissionsStep, markSellerCommissionsPaidStep } from "./steps/payout"

/**
 * Monthly payout batch (plan §6.5, TASKS P5-05): on the payout day, every
 * pending commission from before this month is approved, and the workflow
 * returns what each seller is owed. Money is sent outside Medusa; then
 * markSellerPayoutPaidWorkflow records it (manual payouts, as plan §6.6
 * starts the marketplace's). A `seller_payout` record is "later" (§6.5).
 */
export const sellerPayoutBatchWorkflow = createWorkflow(
  "seller-payout-batch",
  function (input: { cutoff: Date }) {
    const approved = approveDueCommissionsStep(input)
    return new WorkflowResponse(
      transform(approved, (approved) => ({
        approved: approved.length,
        due: summarizeBySeller(
          approved.map((c) => ({
            seller_id: c.seller_id,
            currency_code: c.currency_code,
            amount: Number(c.amount),
          }))
        ),
      }))
    )
  }
)

export const markSellerPayoutPaidWorkflow = createWorkflow(
  "mark-seller-payout-paid",
  function (input: { seller_id: string; currency_code?: string; paid_at: Date }) {
    const paid = markSellerCommissionsPaidStep(input)
    return new WorkflowResponse(
      transform(paid, (paid) => ({
        paid: paid.length,
        totals: summarizeBySeller(
          paid.map((c) => ({
            seller_id: c.seller_id,
            currency_code: c.currency_code,
            amount: Number(c.amount),
          }))
        ),
      }))
    )
  }
)
