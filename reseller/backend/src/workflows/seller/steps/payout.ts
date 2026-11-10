import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SELLER_MODULE } from "../../../modules/seller"
import SellerModuleService from "../../../modules/seller/service"

/**
 * TASKS P5-05: pending commissions recorded before the cutoff become
 * approved (due in this payout). Running it again finds nothing new.
 */
export const approveDueCommissionsStep = createStep(
  "approve-due-seller-commissions",
  async (input: { cutoff: Date }, { container }) => {
    const sellers = container.resolve<SellerModuleService>(SELLER_MODULE)
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
