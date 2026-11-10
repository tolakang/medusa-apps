import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { WISHLIST_MODULE } from "../../../../../../modules/wishlist"
import type WishlistModuleService from "../../../../../../modules/wishlist/service"
import { createShareToken } from "../../../../../../lib/wishlist-share"
import { requestSalesChannel, shareSecret } from "../../../../wishlists/helpers"

// POST /store/customers/me/wishlists/share → { token, expires_at }. Anyone
// with the token can view the wishlist's products (not who owns it) until it
// expires (WISHLIST_SHARE_DAYS, default 30).
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const service: WishlistModuleService = req.scope.resolve(WISHLIST_MODULE)
  const [wishlist] = await service.listWishlists({
    customer_id: req.auth_context.actor_id,
    sales_channel_id: requestSalesChannel(req),
  })
  if (!wishlist) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Add something to your wishlist first.")
  }
  res.json(createShareToken(wishlist.id, shareSecret(req)))
}
