import { z } from "@medusajs/framework/zod"

// GET /admin/vendor-commissions (F-078): `?refund_review=to_review` lists the
// commissions held for a refund.
export const GetAdminVendorCommissions = z
  .object({
    refund_review: z.enum(["none", "to_review", "settled"]).optional(),
    status: z.enum(["pending", "approved", "paid", "cancelled"]).optional(),
    vendor_id: z.string().min(1).optional(),
  })
  .strict()

// POST /admin/vendor-commissions/:id/settle: keep, reduce (payout_amount) or
// cancel a held commission.
export const PostAdminVendorCommissionSettle = z
  .object({
    action: z.enum(["keep", "reduce", "cancel"]),
    payout_amount: z.number().min(0).optional(),
  })
  .strict()

export type PostAdminVendorCommissionSettleType = z.infer<typeof PostAdminVendorCommissionSettle>
