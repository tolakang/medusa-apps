import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { markVendorPayoutPaidWorkflow } from "../../../../../workflows/marketplace/create-payouts"
import { PAYOUT_FIELDS } from "../../route"
import type { PostAdminVendorPayoutPayType } from "../../validators"

// POST /admin/vendor-payouts/:id/pay (TASKS P6-06): after paying the vendor
// outside Medusa, the admin records it with the transfer's reference; the
// payout and its commissions become paid.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminVendorPayoutPayType>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  await query.graph(
    { entity: "vendor_payout", fields: ["id"], filters: { id: req.params.id } },
    { throwIfKeyNotFound: true }
  )
  await markVendorPayoutPaidWorkflow(req.scope).run({
    input: { id: req.params.id, reference: req.validatedBody.reference },
  })
  const {
    data: [payout],
  } = await query.graph({
    entity: "vendor_payout",
    fields: PAYOUT_FIELDS,
    filters: { id: req.params.id },
  })
  res.json({ vendor_payout: payout })
}
