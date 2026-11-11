import { z } from "@medusajs/framework/zod"

// TASKS P5-06: seller portal request schemas.

// The code the shop gave with the invitation (REVIEW_FIXES B11).
export const PostSellerAccept = z
  .object({ invite_code: z.string().trim().min(1).max(40) })
  .strict()

export type PostSellerAcceptType = z.infer<typeof PostSellerAccept>

export const PostSellerProducts = z
  .object({
    add: z.array(z.string().min(1)).max(200).optional(),
    remove: z.array(z.string().min(1)).max(200).optional(),
  })
  .strict()

export type PostSellerProductsType = z.infer<typeof PostSellerProducts>

export const GetSellerCommissions = z
  .object({
    status: z.enum(["pending", "approved", "paid", "cancelled"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict()

export type GetSellerCommissionsType = z.infer<typeof GetSellerCommissions>
