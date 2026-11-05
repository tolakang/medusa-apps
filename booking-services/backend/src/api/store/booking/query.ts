import { MedusaError } from "@medusajs/framework/utils"
import type { z } from "@medusajs/framework/zod"

// Query strings of the booking routes, parsed like the POS routes
// (pos/backend/src/api/pos-query.ts): a bad query is a 400.
export function parseBookingQuery<T extends z.ZodTypeAny>(schema: T, query: unknown): z.infer<T> {
  const parsed = schema.safeParse(query ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid query: ${issue?.path.join(".") || "query"}: ${issue?.message ?? "invalid"}`
    )
  }
  return parsed.data
}
