import { z } from "@medusajs/framework/zod"

// GET /admin/vendor-products (TASKS P6-07): the moderation queue is
// `?status=proposed`.
export const GetAdminVendorProducts = z
  .object({
    status: z.enum(["draft", "proposed", "published", "rejected"]).optional(),
    vendor_id: z.string().min(1).optional(),
  })
  .strict()

// POST /admin/vendor-products/:id/review: publish or reject a vendor's product.
export const PostAdminVendorProductReview = z
  .object({ action: z.enum(["publish", "reject"]) })
  .strict()

export type PostAdminVendorProductReviewType = z.infer<typeof PostAdminVendorProductReview>
