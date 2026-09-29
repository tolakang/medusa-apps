import { HttpTypes } from "@medusajs/types"
import { KH_COUNTRY_CODE } from "@lib/util/kh-locations"

// Required contact by delivery country (owner, TASKS P1-16): Cambodia needs
// the delivery phone (email optional); other countries need the email, as in
// the starter. The backend checks the same rule when the order is placed
// (ecommerce/backend/src/api/phone-validation.ts `contactProblem`).
export function hasRequiredContact(cart: HttpTypes.StoreCart): boolean {
  if (cart.shipping_address?.country_code === KH_COUNTRY_CODE) {
    return !!cart.shipping_address.phone
  }
  return !!cart.email
}
