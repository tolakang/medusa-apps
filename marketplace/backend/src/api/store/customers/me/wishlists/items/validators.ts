import { z } from "@medusajs/framework/zod"

export const PostWishlistItem = z.object({ variant_id: z.string().min(1) })
export type PostWishlistItemType = z.infer<typeof PostWishlistItem>
