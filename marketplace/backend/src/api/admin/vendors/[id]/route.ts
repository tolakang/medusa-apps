import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../modules/marketplace/service"
import { ADMIN_VENDOR_FIELDS } from "../route"
import type { PostAdminVendorType } from "../validators"
import { ensureVendorStockLocation } from "../../../../lib/vendor-stock"
import { emailVerified, VENDOR_EMAIL_NOT_VERIFIED_MESSAGE } from "../../../../lib/vendor-email"

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
  // Approval needs a vendor admin whose sign-in email is confirmed, so a
  // shop signed up with someone else's address can't go live (review 2, A3).
  if (req.validatedBody.status === "active" && vendor.status !== "active") {
    const emails = (vendor.admins ?? []).map((a) => a?.email).filter(Boolean) as string[]
    const checks = await Promise.all(emails.map((email) => emailVerified(req.scope, email)))
    if (!checks.some(Boolean)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, VENDOR_EMAIL_NOT_VERIFIED_MESSAGE)
    }
  }
  await req.scope
    .resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
    .updateVendors({ id: vendor.id, ...req.validatedBody })
  // An approved vendor gets its own stock location (F-080, P6-15).
  if (req.validatedBody.status === "active") {
    await ensureVendorStockLocation(req.scope, vendor.id)
  }
  res.json({ vendor: await vendorById(req, vendor.id) })
}
