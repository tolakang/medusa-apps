import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { isValidPhone, PHONE_MESSAGE } from "../lib/phone"
import {
  isValidTelegramContact,
  TELEGRAM_CONTACT_KEY,
  TELEGRAM_CONTACT_MESSAGE,
} from "../lib/telegram-contact"

// Refuses store requests whose phone fields contain letters or too few/many
// digits, before Medusa saves them. Covers the cart's shipping and billing
// addresses, the customer's own phone and saved addresses.

type Body = {
  phone?: unknown
  shipping_address?: { phone?: unknown } | null
  billing_address?: { phone?: unknown } | null
  metadata?: Record<string, unknown> | null
}

export function phoneProblem(body: Body | undefined): string | null {
  const fields: [string, unknown][] = [
    ["Phone", body?.phone],
    ["Shipping address phone", body?.shipping_address?.phone],
    ["Billing address phone", body?.billing_address?.phone],
  ]
  const bad = fields.find(([, value]) => !isValidPhone(value))
  if (bad) {
    return `${bad[0]}: ${PHONE_MESSAGE}`
  }
  // The optional Telegram contact rides in the cart's metadata (P1-16).
  return isValidTelegramContact(body?.metadata?.[TELEGRAM_CONTACT_KEY])
    ? null
    : TELEGRAM_CONTACT_MESSAGE
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
export const EMAIL_REQUIRED_MESSAGE =
  "Add an email address so we can send your order confirmation."

// Required contact before the order is placed, by delivery country (owner,
// 2026-09-29): Cambodia needs the delivery phone (email optional, TASKS P1-16);
// other countries need the email, as in the starter (phone optional).
export function contactProblem(cart: {
  email?: string | null
  shipping_address?: { country_code?: string | null; phone?: string | null } | null
}): string | null {
  if (cart.shipping_address?.country_code?.toLowerCase() === "kh") {
    const phone = cart.shipping_address.phone
    return phone && isValidPhone(phone) ? null : SHIPPING_PHONE_REQUIRED_MESSAGE
  }
  return cart.email ? null : EMAIL_REQUIRED_MESSAGE
}

// Checked on cart completion, not on every cart update, because the
// storefront saves the address in steps. A cart without a shipping address is
// left to Medusa's own completion checks.
export async function requireContact(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    fields: ["id", "email", "shipping_address.country_code", "shipping_address.phone"],
    filters: { id: req.params.id },
  })
  const problem = cart?.shipping_address ? contactProblem(cart) : null
  if (problem) {
    return next(new MedusaError(MedusaError.Types.INVALID_DATA, problem))
  }
  next()
}

// The same rule when a payment starts: a PayWay callback completes the cart
// inside Medusa without passing through /store/carts/:id/complete, so the
// contact is checked before the customer can pay. The cart comes from the core
// cart ↔ payment collection link (field alias `cart` on payment_collection).
export async function requireContactBeforePayment(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [collection],
  } = await query.graph({
    entity: "payment_collection",
    fields: ["cart.email", "cart.shipping_address.country_code", "cart.shipping_address.phone"],
    filters: { id: req.params.id },
  })
  const cart = (collection as { cart?: Parameters<typeof contactProblem>[0] } | undefined)?.cart
  const problem = cart?.shipping_address ? contactProblem(cart) : null
  if (problem) {
    return next(new MedusaError(MedusaError.Types.INVALID_DATA, problem))
  }
  next()
}
