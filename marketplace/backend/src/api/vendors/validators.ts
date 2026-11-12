import { z } from "@medusajs/framework/zod"

const HANDLE = /^[a-z0-9]+(-[a-z0-9]+)*$/

// POST /vendors (TASKS P6-03): vendor sign-up. Like the official Vendors
// example's PostVendorCreateSchema, except the admin's email: it comes from
// the registration (create-vendor workflow), so the body can't set it.
export const PostVendorCreate = z
  .object({
    name: z.string().trim().min(1).max(120),
    handle: z
      .string()
      .regex(HANDLE, "Use lowercase letters, digits and single hyphens.")
      .max(60)
      .optional(),
    // The shop's contact email, if not the sign-in email.
    email: z.string().email().optional(),
    logo: z.string().url().max(2048).nullable().optional(),
    admin: z
      .object({
        first_name: z.string().trim().max(80).nullable().optional(),
        last_name: z.string().trim().max(80).nullable().optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .refine(
    (body) => body.handle !== undefined || /[a-z0-9]/i.test(body.name),
    { message: "Give a handle: the name has no letters or digits to make one from.", path: ["handle"] }
  )

export type PostVendorCreateType = z.infer<typeof PostVendorCreate>
