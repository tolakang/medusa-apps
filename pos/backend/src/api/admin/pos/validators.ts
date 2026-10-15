import { z } from "@medusajs/framework/zod"

// Admin setup and reports for the POS (TASKS P2-06). Cashier invitations keep
// their own schema in ./cashiers/validators.ts (P2-03).

export const PostAdminPosRegister = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(50),
  is_active: z.boolean().optional(),
  stock_location_id: z.string().min(1),
  sales_channel_id: z.string().min(1),
})
export type PostAdminPosRegisterType = z.infer<typeof PostAdminPosRegister>

export const PostAdminPosRegisterUpdate = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    is_active: z.boolean().optional(),
    stock_location_id: z.string().min(1).optional(),
    sales_channel_id: z.string().min(1).optional(),
  })
  .strict()
export type PostAdminPosRegisterUpdateType = z.infer<typeof PostAdminPosRegisterUpdate>

export const PostAdminPosCashierUpdate = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
export type PostAdminPosCashierUpdateType = z.infer<typeof PostAdminPosCashierUpdate>

// GET /admin/pos/shifts: the report filters (per register, cashier, day; P2-07).
export const GetAdminPosShifts = z.object({
  register_id: z.string().optional(),
  cashier_id: z.string().optional(),
  status: z.enum(["open", "closed"]).optional(),
  // Shifts opened on or after `from` and before `to` (ISO dates or times).
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
