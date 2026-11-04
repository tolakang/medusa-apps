import { z } from "@medusajs/framework/zod"

// Admin booking routes (TASKS P3-11). Weekly hours as in booking_schedule
// (P3-01): weekday 0-6 (0 = Sunday), "HH:MM" local to the resource.
const hhmm = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "must be HH:MM")
const hours = z
  .object({ weekday: z.number().int().min(0).max(6), start_time: hhmm, end_time: hhmm })
  .refine((h) => h.start_time < h.end_time, "start_time must be before end_time")
const type = z.enum(["staff", "room", "equipment", "venue"])
const instant = z.string().datetime({ offset: true })

export const PostAdminBookingResource = z.object({
  name: z.string().min(1),
  type,
  capacity: z.number().int().min(1).optional(),
  timezone: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
  schedules: z.array(hours).optional(),
  variant_ids: z.array(z.string().min(1)).optional(),
})
export type PostAdminBookingResourceType = z.infer<typeof PostAdminBookingResource>

export const PostAdminBookingResourceUpdate = PostAdminBookingResource.partial()
export type PostAdminBookingResourceUpdateType = z.infer<typeof PostAdminBookingResourceUpdate>

export const GetAdminBookings = z.object({
  resource_id: z.string().min(1).optional(),
  from: instant,
  to: instant,
})

export const PostAdminWalkIn = z.object({
  resource_id: z.string().min(1),
  starts_at: instant,
  ends_at: instant,
  customer_id: z.string().min(1).nullish(),
  notes: z.string().max(500).nullish(),
})
export type PostAdminWalkInType = z.infer<typeof PostAdminWalkIn>
