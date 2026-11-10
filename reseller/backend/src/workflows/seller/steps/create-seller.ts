import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SELLER_MODULE } from "../../../modules/seller"
import SellerModuleService from "../../../modules/seller/service"

export type CreateSellerInput = {
  handle: string
  name: string
  email: string
  domain?: string | null
  status?: "pending" | "active" | "suspended"
  commission_rate?: number | null
}

// TASKS P5-02: one seller; removed again if a later step fails.
export const createSellerStep = createStep(
  "create-seller",
  async (input: CreateSellerInput, { container }) => {
    const seller = await container
      .resolve<SellerModuleService>(SELLER_MODULE)
      .createSellers(input)
    return new StepResponse(seller, seller.id)
  },
  async (sellerId: string | undefined, { container }) => {
    if (!sellerId) {
      return
    }
    await container
      .resolve<SellerModuleService>(SELLER_MODULE)
      .deleteSellers(sellerId)
  }
)
