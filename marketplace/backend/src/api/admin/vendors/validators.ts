import { z } from "@medusajs/framework/zod"

// GET /admin/vendors (TASKS P6-03): the approval queue is `?status=pending`.
export const GetAdminVendors = z
  .object({
    status: z.enum(["pending", "active", "suspended"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict()

export type GetAdminVendorsType = z.infer<typeof GetAdminVendors>

// POST /admin/vendors/:id (TASKS P6-03): approve (`active`), suspend, or set
// the vendor's commission rate (null = MARKETPLACE_DEFAULT_COMMISSION_RATE).
export const PostAdminVendor = z
  .object({
    status: z.enum(["pending", "active", "suspended"]).optional(),
    commission_rate: z.number().min(0).max(100).nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Send status or commission_rate.",
  })

export type PostAdminVendorType = z.infer<typeof PostAdminVendor>
