import { z } from "@medusajs/framework/zod"

// An admin invites a cashier by name and email (TASKS P2-03).
export const PostAdminPosCashier = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
})

export type PostAdminPosCashierType = z.infer<typeof PostAdminPosCashier>
