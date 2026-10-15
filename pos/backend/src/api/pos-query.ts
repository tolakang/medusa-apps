import { MedusaError } from "@medusajs/framework/utils"
import type { z } from "@medusajs/framework/zod"

// Query strings of the POS routes (TASKS P2-06). Medusa's
// validateAndTransformQuery is built for the core list routes (fields and
// pagination config), so these routes parse with their own zod schema; a bad
// query is a 400 like a bad body.
export function parsePosQuery<T extends z.ZodTypeAny>(schema: T, query: unknown): z.infer<T> {
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
