import { z } from "@medusajs/framework/zod"

export const MIN_PASSWORD_LENGTH = 8

export const PostCustomerPassword = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(MIN_PASSWORD_LENGTH),
})
export type PostCustomerPasswordType = z.infer<typeof PostCustomerPassword>
