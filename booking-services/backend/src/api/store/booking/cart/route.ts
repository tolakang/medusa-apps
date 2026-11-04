import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { addBookingToCartWorkflow } from "../../../../workflows/add-booking-to-cart"
import type { PostBookingCartType } from "../validators"

// POST /store/booking/cart { cart_id, variant_id, resource_id, starts_at,
// ends_at, notes? } (TASKS P3-10, F-047): hold the time and add it to the
// cart (add-booking-to-cart, P3-04). Not in the plan's route list; the
// storefront needs it (P3-13).
export const POST = async (req: MedusaRequest<PostBookingCartType>, res: MedusaResponse) => {
  const { result } = await addBookingToCartWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  res.json({
    booking: {
      id: result.booking.id,
      status: result.booking.status,
      starts_at: result.booking.starts_at,
      ends_at: result.booking.ends_at,
      hold_expires_at: result.booking.hold_expires_at,
    },
    line_item_id: result.line_item_id,
  })
}
