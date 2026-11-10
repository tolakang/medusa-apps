import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SELLER_MODULE } from "../../../modules/seller"
import { adjustCommission } from "../../../modules/seller/commission"
import SellerModuleService from "../../../modules/seller/service"
import type { InferTypeOf } from "@medusajs/framework/types"
import { SellerCommission } from "../../../modules/seller/models/seller-commission"

type Previous = { id: string; status: string; amount: number } | null
type AdjustResult = {
  commission: InferTypeOf<typeof SellerCommission> | null
  change: string
}

/**
 * TASKS P5-04: cancel-commission. An order cancelled → its commission is
 * cancelled; refunded → recalculated on what the shop kept (cancelled when
 * nothing is left). Paid commissions are left for the payout (P5-05).
 */
export const adjustSellerCommissionStep = createStep(
  "adjust-seller-commission",
  async (
    input: { order_id: string; kind: "canceled" | "refunded" },
    { container }
  ): Promise<StepResponse<AdjustResult, Previous>> => {
    const sellers = container.resolve<SellerModuleService>(SELLER_MODULE)
    const [commission] = await sellers.listSellerCommissions({ order_id: input.order_id })
    if (!commission) {
      return new StepResponse({ commission: null, change: "no commission" }, null)
    }

    let refunded_total = 0
    if (input.kind === "refunded") {
      const {
        data: [order],
      } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "order",
        fields: ["id", "payment_collections.refunded_amount"],
        filters: { id: input.order_id },
      })
      refunded_total = (order?.payment_collections ?? []).reduce(
        (sum, collection) => sum + Number(collection?.refunded_amount ?? 0),
        0
      )
    }

    const plan = adjustCommission(
      {
        status: commission.status,
        order_total: Number(commission.order_total),
        rate: Number(commission.rate),
        amount: Number(commission.amount),
      },
      input.kind === "canceled" ? { kind: "canceled" } : { kind: "refunded", refunded_total }
    )
    if (plan.action === "none") {
      if (plan.reason === "already paid out") {
        container
          .resolve(ContainerRegistrationKeys.LOGGER)
          .warn(
            `Seller commission ${commission.id} for order ${input.order_id} is already paid; ` +
              `the ${input.kind} order is left for the payout to settle.`
          )
      }
      return new StepResponse({ commission, change: plan.reason }, null)
    }

    const previous: Previous = {
      id: commission.id,
      status: commission.status,
      amount: Number(commission.amount),
    }
    const [updated] = await sellers.updateSellerCommissions([
      plan.action === "cancel"
        ? { id: commission.id, status: "cancelled" as const }
        : { id: commission.id, amount: plan.amount },
    ])
    return new StepResponse({ commission: updated, change: plan.action }, previous)
  },
  async (previous: Previous, { container }) => {
    if (!previous) {
      return
    }
    await container.resolve<SellerModuleService>(SELLER_MODULE).updateSellerCommissions([
      {
        id: previous.id,
        status: previous.status as "pending" | "approved" | "paid" | "cancelled",
        amount: previous.amount,
      },
    ])
  }
)
