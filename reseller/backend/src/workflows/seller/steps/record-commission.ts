import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SELLER_MODULE } from "../../../modules/seller"
import { commissionAmount, commissionBase, commissionRateFor } from "../../../modules/seller/commission"
import SellerModuleService from "../../../modules/seller/service"
import type { InferTypeOf } from "@medusajs/framework/types"
import { SellerCommission } from "../../../modules/seller/models/seller-commission"

type RecordResult = {
  commission: InferTypeOf<typeof SellerCommission> | null
  created: boolean
}

/**
 * TASKS P5-04: the order's commission, created once. Returns the existing
 * one when the order already has it (the event came twice), and null for
 * draft orders and for channels without an active seller (your own
 * channel). The workflow holds a lock on the order, and `order_id` is
 * unique (P5-01) as the last guard.
 */
export const recordSellerCommissionStep = createStep(
  "record-seller-commission",
  async (
    input: { order_id: string },
    { container }
  ): Promise<StepResponse<RecordResult, string | null>> => {
    const sellers = container.resolve<SellerModuleService>(SELLER_MODULE)
    const [existing] = await sellers.listSellerCommissions({ order_id: input.order_id })
    if (existing) {
      return new StepResponse({ commission: existing, created: false }, null)
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "status",
        "is_draft_order",
        "item_total",
        "item_tax_total",
        "currency_code",
        "sales_channel_id",
      ],
      filters: { id: input.order_id },
    })
    if (!order || order.is_draft_order || order.status === "draft" || !order.sales_channel_id) {
      return new StepResponse({ commission: null, created: false }, null)
    }

    const {
      data: [channel],
    } = await query.graph({
      entity: "sales_channel",
      fields: ["id", "seller.id", "seller.status", "seller.commission_rate"],
      filters: { id: order.sales_channel_id },
    })
    const seller = channel?.seller
    if (!seller || seller.status !== "active") {
      return new StepResponse({ commission: null, created: false }, null)
    }

    // `order_total` holds the commission's base: the items after discounts,
    // without tax and shipping (D11, TASKS P5-12).
    const base = commissionBase(order)
    const rate = commissionRateFor(seller)
    const commission = await sellers.createSellerCommissions({
      seller_id: seller.id,
      order_id: order.id,
      order_total: base,
      rate,
      amount: commissionAmount(base, rate),
      currency_code: order.currency_code,
    })
    return new StepResponse({ commission, created: true }, commission.id)
  },
  async (createdId: string | null, { container }) => {
    if (!createdId) {
      return
    }
    await container
      .resolve<SellerModuleService>(SELLER_MODULE)
      .deleteSellerCommissions(createdId)
  }
)
