import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { removeWishlistItemWorkflow } from "../../../../../../../workflows/wishlist"
import { requestSalesChannel } from "../../../../../wishlists/helpers"

// DELETE /store/customers/me/wishlists/items/:id → { wishlist }.
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { result } = await removeWishlistItemWorkflow(req.scope).run({
    input: {
      customer_id: req.auth_context.actor_id,
      sales_channel_id: requestSalesChannel(req),
      item_id: req.params.id,
    },
  })
  res.json({ wishlist: result })
}
