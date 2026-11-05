import { HttpTypes } from "@medusajs/types"
import { KH_COUNTRY_CODE } from "@lib/util/kh-locations"
import { isServiceOnlyCart } from "@lib/util/booking"

// Required contact by delivery country (owner, TASKS P1-16): Cambodia needs
// the delivery phone (email optional); other countries need the email, as in
// the starter. The backend checks the same rule when the order is placed
// (booking-services/backend/src/api/contact-validation.ts `contactProblem`).
// A cart of booked services only (nothing shipped) needs an email or a phone
// instead (backend F-048, TASKS P3-12 / P3-13).
export function hasRequiredContact(cart: HttpTypes.StoreCart): boolean {
  if (isServiceOnlyCart(cart)) {
    return !!cart.email || !!cart.shipping_address?.phone
  }
  if (cart.shipping_address?.country_code === KH_COUNTRY_CODE) {
    return !!cart.shipping_address.phone
  }
  return !!cart.email
}
