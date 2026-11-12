import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { inviteCode } from "../../../../lib/invite-code"
import { updateSellerWorkflow } from "../../../../workflows/seller/update-seller"
import { SELLER_FIELDS } from "../route"
import type { PostAdminSellerUpdateType } from "../validators"

const sellerById = async (req: AuthenticatedMedusaRequest, id: string) => {
  const {
    data: [seller],
  } = await req.scope
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({ entity: "seller", fields: SELLER_FIELDS, filters: { id } })
  if (!seller) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Seller not found")
  }
  return { ...seller, invite_code: inviteCode("seller", seller.id) }
}

// GET /admin/sellers/:id (TASKS F-081).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ seller: await sellerById(req, req.params.id) })
}

// POST /admin/sellers/:id (TASKS F-081): activate (`status: "active"`) or
// suspend a seller, or change their name, domain or commission rate
// (updateSellerWorkflow).
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminSellerUpdateType>,
  res: MedusaResponse
) => {
  const seller = await sellerById(req, req.params.id)
  await updateSellerWorkflow(req.scope).run({
    input: { id: seller.id, ...req.validatedBody },
  })
  res.json({ seller: await sellerById(req, seller.id) })
}
