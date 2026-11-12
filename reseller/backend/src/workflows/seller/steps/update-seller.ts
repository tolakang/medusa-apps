import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SELLER_MODULE } from "../../../modules/seller"
import SellerModuleService from "../../../modules/seller/service"

export type UpdateSellerInput = {
  id: string
  name?: string
  domain?: string | null
  status?: "pending" | "active" | "suspended"
  commission_rate?: number | null
}

const domainTaken = (domain: string) =>
  new MedusaError(
    MedusaError.Types.DUPLICATE_ERROR,
    `Another seller already uses the domain ${domain}.`
  )

/**
 * One domain per seller (unique index, P5-01): the storefront finds the
 * seller by the request's host (P5-07). Checked first so the admin gets a
 * clear message instead of a database error.
 */
export const assertDomainFree = async (
  sellers: SellerModuleService,
  domain: string | null | undefined,
  exceptId?: string
) => {
  if (!domain) {
    return
  }
  const [other] = await sellers.listSellers({ domain })
  if (other && other.id !== exceptId) {
    throw domainTaken(domain)
  }
}

// TASKS F-081: changes a seller's status, name, domain or commission rate.
// Restores the previous values if a later step fails.
export const updateSellerStep = createStep(
  "update-seller",
  async ({ id, ...data }: UpdateSellerInput, { container }) => {
    const sellers = container.resolve<SellerModuleService>(SELLER_MODULE)
    const before = await sellers.retrieveSeller(id)
    await assertDomainFree(sellers, data.domain, id)
    const seller = await sellers.updateSellers({ id, ...data })
    return new StepResponse(seller, {
      id,
      name: before.name,
      domain: before.domain,
      status: before.status,
      commission_rate: before.commission_rate,
    })
  },
  async (before, { container }) => {
    if (!before) {
      return
    }
    await container.resolve<SellerModuleService>(SELLER_MODULE).updateSellers(before)
  }
)
