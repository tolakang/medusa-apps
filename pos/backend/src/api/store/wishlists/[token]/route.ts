import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { readShareToken } from "../../../../lib/wishlist-share"
import { WISHLIST_FIELDS } from "../../../../workflows/wishlist"
import { requestSalesChannel, shareSecret } from "../helpers"

// GET /store/wishlists/:token → { wishlist: { id, items } } for a shared link
// (TASKS P1-19). The token's signature and expiry are verified (unlike the
// guide's `decode`), and only the products are returned, never the owner.
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const wishlistId = readShareToken(req.params.token, shareSecret(req))
  if (!wishlistId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "This wishlist link is invalid or has expired.")
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [wishlist],
  } = await query.graph({
    entity: "wishlist",
    fields: WISHLIST_FIELDS,
    filters: { id: wishlistId, sales_channel_id: requestSalesChannel(req) },
  })
  if (!wishlist) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "This wishlist link is invalid or has expired.")
  }
  res.json({ wishlist: { id: wishlist.id, items: wishlist.items } })
}
