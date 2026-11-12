import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { settleRefundReviewWorkflow } from "../../../../../workflows/marketplace/refund-review"
import type { PostAdminVendorCommissionSettleType } from "../../validators"

// POST /admin/vendor-commissions/:id/settle (F-078): the admin settles a
// commission held for a refund: keep it, reduce what the vendor gets
// (`payout_amount`), or cancel it. The next payout includes a kept or
// reduced one.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminVendorCommissionSettleType>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  await query.graph(
    { entity: "vendor_commission", fields: ["id"], filters: { id: req.params.id } },
    { throwIfKeyNotFound: true }
  )
  const { result } = await settleRefundReviewWorkflow(req.scope).run({
    input: { id: req.params.id, ...req.validatedBody },
  })
  res.json({ vendor_commission: result })
}
