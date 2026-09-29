import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { isValidPhone, PHONE_MESSAGE } from "../lib/phone"

// Refuses store requests whose phone fields contain letters or too few/many
// digits, before Medusa saves them. Covers the cart's shipping and billing
// addresses, the customer's own phone and saved addresses.

type Body = {
  phone?: unknown
  shipping_address?: { phone?: unknown } | null
  billing_address?: { phone?: unknown } | null
}

export function phoneProblem(body: Body | undefined): string | null {
  const fields: [string, unknown][] = [
    ["Phone", body?.phone],
    ["Shipping address phone", body?.shipping_address?.phone],
    ["Billing address phone", body?.billing_address?.phone],
  ]
  const bad = fields.find(([, value]) => !isValidPhone(value))
  return bad ? `${bad[0]}: ${PHONE_MESSAGE}` : null
}

export function validatePhoneFields(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const problem = phoneProblem(req.body as Body | undefined)
  if (problem) {
    return next(new MedusaError(MedusaError.Types.INVALID_DATA, problem))
  }
  next()
}

export const SHIPPING_PHONE_REQUIRED_MESSAGE =
  "Add a phone number to the delivery address so the courier can reach you."

// The delivery address must have a phone before the order is placed (owner,
// 2026-09-29). Checked on cart completion, not on every cart update, because
// the storefront saves the address in steps.
export async function requireShippingPhone(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    fields: ["id", "shipping_address.phone"],
    filters: { id: req.params.id },
  })
  const phone = cart?.shipping_address?.phone
  if (cart && (!phone || !isValidPhone(phone))) {
    return next(new MedusaError(MedusaError.Types.INVALID_DATA, SHIPPING_PHONE_REQUIRED_MESSAGE))
  }
  next()
}
