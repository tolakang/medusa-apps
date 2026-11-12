import { z } from "@medusajs/framework/zod"

// GET /admin/vendor-payouts (TASKS P6-06): the payout report.
export const GetAdminVendorPayouts = z
  .object({
    status: z.enum(["pending", "paid", "cancelled"]).optional(),
    vendor_id: z.string().min(1).optional(),
    period: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict()

// POST /admin/vendor-payouts/:id/pay: the bank transfer's reference.
export const PostAdminVendorPayoutPay = z
  .object({ reference: z.string().trim().min(1).max(200) })
  .strict()

export type PostAdminVendorPayoutPayType = z.infer<typeof PostAdminVendorPayoutPay>
