import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
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
