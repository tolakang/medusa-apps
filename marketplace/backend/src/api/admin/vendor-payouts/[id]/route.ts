import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PAYOUT_FIELDS } from "../route"

export const COMMISSION_FIELDS = [
  "id",
  "order_id",
  "order_total",
  "base",
  "rate",
  "amount",
  "payout_amount",
  "currency_code",
  "status",
  "created_at",
]

// GET /admin/vendor-payouts/:id (TASKS P6-06): one payout with the child
// orders it pays for.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [payout],
  } = await query.graph(
    { entity: "vendor_payout", fields: PAYOUT_FIELDS, filters: { id: req.params.id } },
    { throwIfKeyNotFound: true }
  )
  const { data: commissions } = await query.graph({
    entity: "vendor_commission",
    fields: COMMISSION_FIELDS,
    filters: { payout_id: payout.id },
  })
  res.json({ vendor_payout: { ...payout, commissions } })
}
