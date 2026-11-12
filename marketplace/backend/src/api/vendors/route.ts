import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { createVendorWorkflow } from "../../workflows/marketplace/create-vendor"
import { vendorResponse } from "../vendor-auth"
import type { PostVendorCreateType } from "./validators"

// POST /vendors (BUILD_PLAN §6.6, TASKS P6-03), called with the registration
// token from POST /auth/vendor/emailpass/register. Creates the vendor
// (pending until the admin approves it) and its first admin; then the admin
// signs in at POST /auth/vendor/emailpass.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostVendorCreateType>,
  res: MedusaResponse
) => {
  if (req.auth_context.actor_id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "This account already belongs to a vendor."
    )
  }
  const { result } = await createVendorWorkflow(req.scope).run({
    input: { ...req.validatedBody, auth_identity_id: req.auth_context.auth_identity_id },
  })
  res.status(201).json(await vendorResponse(req.scope, result.admin.id))
}
