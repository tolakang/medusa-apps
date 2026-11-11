import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SELLER_MODULE } from "../../../modules/seller"
import SellerModuleService from "../../../modules/seller/service"

/**
 * TASKS P5-05: pending commissions recorded before the cutoff become
 * approved (due in this payout). Running it again finds nothing new.
 */
// REVIEW_FIXES B10: a refund adjusts a commission under the per-order lock
// `seller-commission:<order_id>`. A payout used to list commissions and then
// update them without it, so a commission a refund had just cancelled could
// be marked paid. The payout workflows now lock the same keys (found by the
// steps below), and these steps read the statuses again inside the lock.

/** The lock keys of the commissions a payout would change. */
export const payoutLockKeysStep = createStep(
  "seller-payout-lock-keys",
  async (
    input: { status: "pending" | "approved"; cutoff?: Date; seller_id?: string; currency_code?: string },
    { container }
  ) => {
    const rows = await container
      .resolve<SellerModuleService>(SELLER_MODULE)
      .listSellerCommissions({
        status: input.status,
        ...(input.cutoff ? { created_at: { $lt: input.cutoff } } : {}),
        ...(input.seller_id ? { seller_id: input.seller_id } : {}),
        ...(input.currency_code ? { currency_code: input.currency_code } : {}),
      })
    // Never empty: one key for the payout itself, so two payouts of the same
    // kind don't run at once either.
    return new StepResponse([
      `seller-payout:${input.seller_id ?? "batch"}`,
      ...rows.map((row) => `seller-commission:${row.order_id}`),
    ])
  }
)

export const approveDueCommissionsStep = createStep(
  "approve-due-seller-commissions",
  async (input: { cutoff: Date }, { container }) => {
    const sellers = container.resolve<SellerModuleService>(SELLER_MODULE)
    // Read inside the lock: a refund may have cancelled some since.
    const due = await sellers.listSellerCommissions({
      status: "pending",
      created_at: { $lt: input.cutoff },
    })
    if (!due.length) {
      return new StepResponse([], [] as string[])
    }
    const approved = await sellers.updateSellerCommissions(
      due.map((commission) => ({ id: commission.id, status: "approved" as const }))
    )
    return new StepResponse(approved, due.map((commission) => commission.id))
  },
  async (ids: string[] | undefined, { container }) => {
    if (!ids?.length) {
      return
    }
    await container
      .resolve<SellerModuleService>(SELLER_MODULE)
      .updateSellerCommissions(ids.map((id) => ({ id, status: "pending" as const })))
  }
)

/**
 * TASKS P5-05: the shop paid a seller; their approved commissions become
 * paid. Only approved ones: pending commissions aren't due yet.
 */
export const markSellerCommissionsPaidStep = createStep(
  "mark-seller-commissions-paid",
  async (input: { seller_id: string; currency_code?: string; paid_at: Date }, { container }) => {
    const sellers = container.resolve<SellerModuleService>(SELLER_MODULE)
    // Read inside the lock: a refund may have cancelled or changed some since.
    const approved = await sellers.listSellerCommissions({
      seller_id: input.seller_id,
      status: "approved",
      ...(input.currency_code ? { currency_code: input.currency_code } : {}),
    })
    if (!approved.length) {
      return new StepResponse([], [] as string[])
    }
    const paid = await sellers.updateSellerCommissions(
      approved.map((commission) => ({
        id: commission.id,
        status: "paid" as const,
        paid_at: input.paid_at,
      }))
    )
    return new StepResponse(paid, approved.map((commission) => commission.id))
  },
  async (ids: string[] | undefined, { container }) => {
    if (!ids?.length) {
      return
    }
    await container
      .resolve<SellerModuleService>(SELLER_MODULE)
      .updateSellerCommissions(
        ids.map((id) => ({ id, status: "approved" as const, paid_at: null }))
      )
  }
)
