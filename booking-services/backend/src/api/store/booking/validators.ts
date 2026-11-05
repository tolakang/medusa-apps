import { z } from "@medusajs/framework/zod"

// Store booking routes (TASKS P3-10). Times are ISO 8601 instants; a date is
// a local calendar date of the resource.
const instant = z.string().datetime({ offset: true })

export const GetBookingAvailability = z.object({
  resource_id: z.string().min(1),
  starts_at: instant,
  ends_at: instant,
})

export const GetBookingSlots = z.object({
  variant_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  resource_id: z.string().min(1).optional(),
  duration_minutes: z.coerce.number().int().min(5).max(720).default(60),
})

export const PostBookingCancel = z.object({ booking_id: z.string().min(1) })
export type PostBookingCancelType = z.infer<typeof PostBookingCancel>

export const PostBookingCart = z.object({
  cart_id: z.string().min(1),
  variant_id: z.string().min(1),
  resource_id: z.string().min(1),
  starts_at: instant,
  ends_at: instant,
  notes: z.string().max(500).nullish(),
})
export type PostBookingCartType = z.infer<typeof PostBookingCart>
