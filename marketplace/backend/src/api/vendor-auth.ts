import {
  authenticate,
  type AuthenticatedMedusaRequest,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  parseCorsOrigins,
} from "@medusajs/framework/utils"
import cors from "cors"

// Access to /vendors/* (BUILD_PLAN §6.6, TASKS P6-03), like Reseller's
// /sellers/* (reseller/backend/src/api/seller-auth.ts). Medusa's own CORS
// covers only /store, /admin and /auth (MEDUSA_SKILL §7), so /vendors gets the
// docs' cors + parseCorsOrigins middleware with VENDOR_CORS. The portal's
// origins also go in AUTH_CORS for /auth/vendor/*.
export function vendorCors(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  return cors({
    origin: parseCorsOrigins(process.env.VENDOR_CORS ?? ""),
    credentials: true,
  })(req, res, next)
}

// Sign-up: the only /vendors call a registration token (no vendor yet) may
// make, as in the official Vendors example.
export const VENDOR_SIGNUP_PATH = "/vendors"
// What a vendor waiting for approval may still call.
export const PENDING_VENDOR_PATHS = ["/vendors/me"]

export const VENDOR_SUSPENDED_MESSAGE = "This vendor account is suspended."
export const VENDOR_PENDING_MESSAGE =
  "This vendor account is waiting for the marketplace's approval."

const vendorAuth = authenticate("vendor", ["session", "bearer"])
const registrationAuth = authenticate("vendor", ["bearer"], {
  allowUnregistered: true,
})

// Every /vendors route needs a signed-in vendor admin whose vendor is active,
// so a new route is protected without listing it here. A pending vendor may
// only read /vendors/me; a suspended vendor's tokens stop working at once.
// Admin users and customers are refused (other actor types).
export function requireVendor(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const path = (req.originalUrl ?? req.url).split("?")[0].replace(/\/+$/, "")
  if (path === VENDOR_SIGNUP_PATH && req.method === "POST") {
    return registrationAuth(req, res, next)
  }
  return vendorAuth(req, res, (err?: unknown) => {
    if (err) {
      return next(err)
    }
    checkVendorStatus(req as AuthenticatedMedusaRequest, path).then(
      () => next(),
      (e) => next(e)
    )
  })
}

async function checkVendorStatus(req: AuthenticatedMedusaRequest, path: string) {
  const {
    data: [admin],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "vendor_admin",
    fields: ["id", "vendor.id", "vendor.status"],
    filters: { id: req.auth_context.actor_id },
  })
  const status = admin?.vendor?.status
  if (!status || status === "suspended") {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, VENDOR_SUSPENDED_MESSAGE)
  }
  if (status === "pending" && !PENDING_VENDOR_PATHS.includes(path)) {
    throw new MedusaError(MedusaError.Types.FORBIDDEN, VENDOR_PENDING_MESSAGE)
  }
}

// The vendor admin and their vendor, with fixed fields (no `?fields`).
export async function vendorResponse(scope: MedusaContainer, vendorAdminId: string) {
  const {
    data: [admin],
  } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    {
      entity: "vendor_admin",
      fields: [
        "id",
        "email",
        "first_name",
        "last_name",
        "vendor.id",
        "vendor.handle",
        "vendor.name",
        "vendor.email",
        "vendor.logo",
        "vendor.status",
        "vendor.commission_rate",
      ],
      filters: { id: vendorAdminId },
    },
    { throwIfKeyNotFound: true }
  )
  const { vendor, ...vendorAdmin } = admin
  return { vendor_admin: vendorAdmin, vendor }
}
