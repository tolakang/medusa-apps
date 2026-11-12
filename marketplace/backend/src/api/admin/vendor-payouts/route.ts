import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { GetAdminVendorPayouts } from "./validators"

export const PAYOUT_FIELDS = [
  "id",
  "amount",
  "currency_code",
  "period",
  "status",
  "paid_at",
  "reference",
  "created_at",
  "vendor.id",
  "vendor.name",
  "vendor.handle",
]

// GET /admin/vendor-payouts (TASKS P6-06): the manual payout report, newest
// first; `?status=pending` is what is still to pay. Each payout has its
// commissions (one per child order) at GET /admin/vendor-payouts/:id.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const parsed = GetAdminVendorPayouts.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.issues[0].message)
  }
  const { limit, offset, ...filters } = parsed.data
  const { data: payouts, metadata } = await req.scope
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "vendor_payout",
      fields: PAYOUT_FIELDS,
      filters,
      pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
    })
  res.json({ vendor_payouts: payouts, count: metadata?.count ?? payouts.length, limit, offset })
}
