import { z } from "@medusajs/framework/zod"
import { isValidPhone, PHONE_MESSAGE } from "../../lib/phone"
import { POS_PAYMENT_METHODS } from "../../workflows/pos-checkout"

// Bodies and queries of the cashier routes under /pos (TASKS P2-06). The
// cashier is always the signed-in actor, never a body field.

// Money as entered at the till (e.g. 50 or 12.5), never negative.
const cash = z.number().finite().min(0)

export const PostPosShiftOpen = z.object({
  register_id: z.string().min(1),
  opening_cash: cash,
  currency_code: z.string().trim().length(3).optional(),
  notes: z.string().trim().max(500).optional(),
})
export type PostPosShiftOpenType = z.infer<typeof PostPosShiftOpen>

export const PostPosShiftClose = z.object({
  shift_id: z.string().min(1),
  counted_cash: cash,
  notes: z.string().trim().max(500).optional(),
})
export type PostPosShiftCloseType = z.infer<typeof PostPosShiftClose>

export const PostPosCheckout = z.object({
  shift_id: z.string().min(1),
  items: z
    .array(z.object({ variant_id: z.string().min(1), quantity: z.number().int().min(1).max(1000) }))
    .min(1)
    .max(200),
  payment_method: z.enum(POS_PAYMENT_METHODS),
  customer_id: z.string().min(1).optional(),
  email: z.string().trim().email().optional(),
  promo_codes: z.array(z.string().trim().min(1)).max(10).optional(),
})
export type PostPosCheckoutType = z.infer<typeof PostPosCheckout>

// A customer created at the till: a name plus a phone or an email, so the
// shop can find them again.
export const PostPosCustomer = z
  .object({
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().max(100).optional(),
    // Same rule as the online shop (lib/phone.ts).
    phone: z.string().trim().min(1).max(30).refine(isValidPhone, { message: PHONE_MESSAGE }).optional(),
    email: z.string().trim().email().optional(),
  })
  .refine((c) => !!(c.phone || c.email), { message: "Add a phone number or an email." })
export type PostPosCustomerType = z.infer<typeof PostPosCustomer>

export const GetPosCustomers = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const GetPosProductLookup = z.object({
  code: z.string().trim().min(1).max(100),
  shift_id: z.string().min(1),
})
