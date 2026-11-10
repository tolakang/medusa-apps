import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { linkProductsToSalesChannelWorkflow } from "@medusajs/medusa/core-flows"
import { sellerCatalog, sellerChannelId } from "../../seller-catalog"
import type { PostSellerProductsType } from "../../validators"

// GET /sellers/me/products (plan §6.5, TASKS P5-06): your products the
// seller can offer, with `selected` for those in their channel.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const channelId = await sellerChannelId(req.scope, req.auth_context.actor_id)
  const products = await sellerCatalog(req.scope, channelId)
  res.json({ products, count: products.length })
}

// POST /sellers/me/products: `add` / `remove` product IDs in the seller's
// channel. Only your published products can be added; anything else is
// refused, so a seller can't publish drafts or other channels' products.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostSellerProductsType>,
  res: MedusaResponse
) => {
  const channelId = await sellerChannelId(req.scope, req.auth_context.actor_id)
  const catalog = await sellerCatalog(req.scope, channelId)
  const offerable = new Set(catalog.map((product) => product.id))
  const add = [...new Set(req.validatedBody.add ?? [])]
  const remove = [...new Set(req.validatedBody.remove ?? [])]

  const unknown = add.filter((id) => !offerable.has(id))
  if (unknown.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `These products can't be offered: ${unknown.join(", ")}`
    )
  }
  if (add.some((id) => remove.includes(id))) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A product can't be added and removed at once."
    )
  }

  if (add.length || remove.length) {
    await linkProductsToSalesChannelWorkflow(req.scope).run({
      input: { id: channelId, add, remove },
    })
  }
  const products = await sellerCatalog(req.scope, channelId)
  res.json({ products, count: products.length })
}
