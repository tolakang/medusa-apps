import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { SELLER_MODULE } from "../../../../../modules/seller"
import SellerModuleService from "../../../../../modules/seller/service"
import { markSellerPayoutPaidWorkflow } from "../../../../../workflows/seller/payout"
import type { PostAdminSellerPayoutType } from "../../validators"

// POST /admin/sellers/:id/payouts (TASKS P5-05): the shop paid this seller
// (outside Medusa); their approved commissions become paid. Returns what was
// recorded, per currency. Nothing approved = nothing changes.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminSellerPayoutType>,
  res: MedusaResponse
) => {
  const [seller] = await req.scope
    .resolve<SellerModuleService>(SELLER_MODULE)
    .listSellers({ id: req.params.id })
  if (!seller) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Seller not found")
  }
  const { result } = await markSellerPayoutPaidWorkflow(req.scope).run({
    input: {
      seller_id: seller.id,
      currency_code: req.validatedBody.currency_code,
      paid_at: new Date(),
    },
  })
  res.json({ seller_id: seller.id, ...result })
}
