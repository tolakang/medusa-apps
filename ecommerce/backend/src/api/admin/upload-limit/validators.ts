import { z } from "@medusajs/framework/zod"

// limit_mb: a positive number of megabytes, or null to go back to the default.
export const PostAdminUploadLimit = z.object({
  limit_mb: z.number().positive().nullable(),
})

export type PostAdminUploadLimitType = z.infer<typeof PostAdminUploadLimit>
