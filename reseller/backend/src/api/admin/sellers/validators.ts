import { z } from "@medusajs/framework/zod"

// POST /admin/sellers (TASKS P5-03): the shop invites a seller. Formats are
// also database checks (P5-01); here they answer 400 with a clear message.
export const PostAdminSeller = z
  .object({
    handle: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, digits and single hyphens."),
    name: z.string().trim().min(1),
    email: z.string().email(),
    domain: z
      .string()
      .regex(
        /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
        "Use a lowercase host name such as shop.example.com."
      )
      .nullable()
      .optional(),
    status: z.enum(["pending", "active", "suspended"]).optional(),
    commission_rate: z.number().min(0).max(100).nullable().optional(),
  })
  .strict()

export type PostAdminSellerType = z.infer<typeof PostAdminSeller>

// POST /admin/sellers/:id/payouts (TASKS P5-05): optionally one currency.
export const PostAdminSellerPayout = z
  .object({ currency_code: z.string().trim().toLowerCase().length(3).optional() })
  .strict()

export type PostAdminSellerPayoutType = z.infer<typeof PostAdminSellerPayout>
