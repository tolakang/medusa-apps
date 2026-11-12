import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { WISHLIST_FIELDS } from "../../../../../workflows/wishlist"
import { requestSalesChannel } from "../../../wishlists/helpers"

// GET /store/customers/me/wishlists → { wishlist } or { wishlist: null } when
// the customer has saved nothing yet (TASKS P1-19). /store/customers/me*
// requires a signed-in customer (Medusa's built-in protection).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [wishlist],
  } = await query.graph({
    entity: "wishlist",
    fields: WISHLIST_FIELDS,
    filters: { customer_id: req.auth_context.actor_id, sales_channel_id: requestSalesChannel(req) },
  })
  res.json({ wishlist: wishlist ?? null })
}
