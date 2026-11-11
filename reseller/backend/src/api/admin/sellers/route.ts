import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { inviteCode } from "../../../lib/invite-code"
import { createSellerWorkflow } from "../../../workflows/seller/create-seller"
import type { PostAdminSellerType } from "./validators"

const SELLER_FIELDS = [
  "id",
  "handle",
  "name",
  "email",
  "domain",
  "status",
  "commission_rate",
  "created_at",
  "sales_channel.id",
  "sales_channel.name",
]

// GET /admin/sellers (TASKS P5-03): every seller with their sales channel.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { data: sellers } = await req.scope
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({ entity: "seller", fields: SELLER_FIELDS })
  // The invite code is the shop's to hand to each seller (REVIEW_FIXES B11).
  res.json({
    sellers: sellers.map((seller) => ({
      ...seller,
      invite_code: inviteCode("seller", seller.id),
    })),
    count: sellers.length,
  })
}

// POST /admin/sellers (TASKS P5-03): invites a seller. Creates the seller with
// their own sales channel and publishable key (createSellerWorkflow, P5-02);
// the seller then registers with this email and accepts (/sellers/accept)
// with the `invite_code` returned here.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminSellerType>,
  res: MedusaResponse
) => {
  const { result } = await createSellerWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  const {
    data: [seller],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "seller",
    fields: SELLER_FIELDS,
    filters: { id: result.seller.id },
  })
  res.json({
    seller,
    publishable_key: result.publishable_key.token,
    invite_code: inviteCode("seller", result.seller.id),
  })
}
