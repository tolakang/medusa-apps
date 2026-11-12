import { z } from "@medusajs/framework/zod"

// Formats are also database checks (P5-01); here they answer 400 with a
// clear message.
const Domain = z
  .string()
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
    "Use a lowercase host name such as shop.example.com."
  )
const Status = z.enum(["pending", "active", "suspended"])
const CommissionRate = z.number().min(0).max(100)

// POST /admin/sellers (TASKS P5-03): the shop invites a seller.
export const PostAdminSeller = z
  .object({
    handle: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, digits and single hyphens."),
    name: z.string().trim().min(1),
    email: z.string().email(),
    domain: Domain.nullable().optional(),
    status: Status.optional(),
    commission_rate: CommissionRate.nullable().optional(),
  })
  .strict()

export type PostAdminSellerType = z.infer<typeof PostAdminSeller>

// POST /admin/sellers/:id (TASKS F-081): activate or suspend a seller, or
// change their name, domain (null = none) or commission rate (null = the
// shop's default). Handle and email stay: the email is the seller's sign-in.
export const PostAdminSellerUpdate = z
  .object({
    name: z.string().trim().min(1).optional(),
    domain: Domain.nullable().optional(),
    status: Status.optional(),
    commission_rate: CommissionRate.nullable().optional(),
  })
  .strict()

export type PostAdminSellerUpdateType = z.infer<typeof PostAdminSellerUpdate>

// POST /admin/sellers/:id/payouts (TASKS P5-05): optionally one currency.
export const PostAdminSellerPayout = z
  .object({ currency_code: z.string().trim().toLowerCase().length(3).optional() })
  .strict()

export type PostAdminSellerPayoutType = z.infer<typeof PostAdminSellerPayout>
