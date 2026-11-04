import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { addWishlistItemWorkflow } from "../../../../../../workflows/wishlist"
import { requestSalesChannel } from "../../../../wishlists/helpers"
import type { PostWishlistItemType } from "./validators"

// POST /store/customers/me/wishlists/items { variant_id } → { wishlist }.
// Creates the wishlist on the first item; the same variant is kept once.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostWishlistItemType>,
  res: MedusaResponse
) => {
  const { result } = await addWishlistItemWorkflow(req.scope).run({
    input: {
      customer_id: req.auth_context.actor_id,
      sales_channel_id: requestSalesChannel(req),
      variant_id: req.validatedBody.variant_id,
    },
  })
  res.json({ wishlist: result })
}
