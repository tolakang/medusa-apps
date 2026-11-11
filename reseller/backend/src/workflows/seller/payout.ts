import { randomUUID } from "node:crypto"
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { summarizeBySeller } from "../../modules/seller/payout"
import {
  approveDueCommissionsStep,
  markSellerCommissionsPaidStep,
  payoutLockKeysStep,
} from "./steps/payout"

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
    // The same per-order locks as refunds (REVIEW_FIXES B10).
    const keys = payoutLockKeysStep(
      transform(input, (input) => ({ status: "pending" as const, cutoff: input.cutoff }))
    ).config({ name: "seller-payout-batch-keys" })
    // An owner of its own: several keys are taken one by one, and a retry
    // must not stop at the keys this run already holds.
    const ownerId = transform(keys, () => `seller-payout-batch:${randomUUID()}`)
    acquireLockStep({ key: keys, ownerId, timeout: 30, ttl: 120 })
    const approved = approveDueCommissionsStep(input)
    releaseLockStep({ key: keys, ownerId })
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
    const keys = payoutLockKeysStep(
      transform(input, (input) => ({
        status: "approved" as const,
        seller_id: input.seller_id,
        currency_code: input.currency_code,
      }))
    ).config({ name: "seller-payout-paid-keys" })
    const ownerId = transform(keys, () => `seller-payout-paid:${randomUUID()}`)
    acquireLockStep({ key: keys, ownerId, timeout: 30, ttl: 120 })
    const paid = markSellerCommissionsPaidStep(input)
    releaseLockStep({ key: keys, ownerId })
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
