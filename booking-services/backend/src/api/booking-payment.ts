import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { extendBookingHoldsWorkflow } from "../workflows/extend-booking-holds"

// TASKS P3-06: before a payment session is created for a cart, renew the
// cart's booking holds (extend-booking-holds). If renewing fails, the payment
// still goes ahead: checkout re-checks every slot anyway (P3-05), and a
// failed renewal must not block a customer who can still pay.
export async function extendBookingHoldsBeforePayment(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [collection],
  } = await query.graph({
    entity: "payment_collection",
    fields: ["cart.id"],
    filters: { id: req.params.id },
  })
  const cartId = (collection as { cart?: { id?: string } } | undefined)?.cart?.id
  if (cartId) {
    try {
      await extendBookingHoldsWorkflow(req.scope).run({ input: { cart_id: cartId } })
    } catch (e) {
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`Booking holds of cart ${cartId} were not renewed: ${(e as { message?: string })?.message}`)
    }
  }
  next()
}
