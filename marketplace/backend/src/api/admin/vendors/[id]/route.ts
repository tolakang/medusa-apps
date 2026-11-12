import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../modules/marketplace/service"
import { ADMIN_VENDOR_FIELDS } from "../route"
import type { PostAdminVendorType } from "../validators"

const vendorById = async (req: AuthenticatedMedusaRequest, id: string) => {
  const {
    data: [vendor],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    { entity: "vendor", fields: ADMIN_VENDOR_FIELDS, filters: { id } },
    { throwIfKeyNotFound: true }
  )
  return vendor
}

// GET /admin/vendors/:id (TASKS P6-03).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ vendor: await vendorById(req, req.params.id) })
}

// POST /admin/vendors/:id (TASKS P6-03): approve a vendor (`status: "active"`),
// suspend it, or set its commission rate.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminVendorType>,
  res: MedusaResponse
) => {
  const vendor = await vendorById(req, req.params.id)
  await req.scope
    .resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
    .updateVendors({ id: vendor.id, ...req.validatedBody })
  res.json({ vendor: await vendorById(req, vendor.id) })
}
