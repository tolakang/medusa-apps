import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { GetAdminVendors } from "./validators"

export const ADMIN_VENDOR_FIELDS = [
  "id",
  "handle",
  "name",
  "email",
  "logo",
  "status",
  "commission_rate",
  "created_at",
  "admins.id",
  "admins.email",
  "admins.first_name",
  "admins.last_name",
]

// GET /admin/vendors (TASKS P6-03): vendors, newest first; `?status=pending`
// is the approval queue (the admin screen comes in P6-07).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const parsed = GetAdminVendors.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.issues[0].message)
  }
  const { status, limit, offset } = parsed.data
  const { data: vendors, metadata } = await req.scope
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "vendor",
      fields: ADMIN_VENDOR_FIELDS,
      filters: status ? { status } : {},
      pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
    })
  res.json({ vendors, count: metadata?.count ?? vendors.length, limit, offset })
}
