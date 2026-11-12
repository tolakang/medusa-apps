import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SELLER_MODULE } from "../../../modules/seller"
import SellerModuleService from "../../../modules/seller/service"
import { assertDomainFree } from "./update-seller"

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

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
    const sellers = container.resolve<SellerModuleService>(SELLER_MODULE)
    // P5-03: the seller signs in with this email (the invitation is matched
    // by it), so it is stored lowercase and used by one seller only.
    const email = normalizeEmail(input.email)
    const [existing] = await sellers.listSellers({ email })
    if (existing) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        `A seller with the email ${email} already exists.`
      )
    }
    await assertDomainFree(sellers, input.domain)
    const seller = await sellers.createSellers({ ...input, email })
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
