import {
  authenticate,
  type AuthenticatedMedusaRequest,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError, parseCorsOrigins } from "@medusajs/framework/utils"
import cors from "cors"
import { SELLER_MODULE } from "../modules/seller"
import type SellerModuleService from "../modules/seller/service"

// Access to /sellers/* (BUILD_PLAN §6.5, TASKS P5-03), like POS's /pos/*
// (pos/backend/src/api/pos-auth.ts). Medusa's own CORS covers only /store,
// /admin and /auth (MEDUSA_SKILL §7), so /sellers gets the docs' cors +
// parseCorsOrigins middleware with SELLER_CORS. The portal's origins also go
// in AUTH_CORS for /auth/seller/*.
export function sellerCors(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  return cors({
    origin: parseCorsOrigins(process.env.SELLER_CORS ?? ""),
    credentials: true,
  })(req, res, next)
}

// The only /sellers route a registration token (no seller yet) may call.
export const ACCEPT_SELLER_INVITE_PATH = "/sellers/accept"

const sellerAuth = authenticate("seller", ["session", "bearer"])
const registrationAuth = authenticate("seller", ["bearer"], {
  allowUnregistered: true,
})

export const SELLER_SUSPENDED_MESSAGE = "This seller account is suspended."

// Every /sellers route needs a signed-in seller who isn't suspended, so a new
// route is protected without listing it here. Admin users and customers are
// refused (other actor types). A suspended seller's existing token stops
// working at once.
export function requireSeller(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const path = (req.originalUrl ?? req.url).split("?")[0]
  if (path === ACCEPT_SELLER_INVITE_PATH) {
    return registrationAuth(req, res, next)
  }
  return sellerAuth(req, res, (err?: unknown) => {
    if (err) {
      return next(err)
    }
    requireUnsuspendedSeller(req as AuthenticatedMedusaRequest).then(
      () => next(),
      (e) => next(e)
    )
  })
}

async function requireUnsuspendedSeller(req: AuthenticatedMedusaRequest) {
  const sellers = req.scope.resolve<SellerModuleService>(SELLER_MODULE)
  const [seller] = await sellers.listSellers({ id: req.auth_context.actor_id })
  if (!seller || seller.status === "suspended") {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, SELLER_SUSPENDED_MESSAGE)
  }
}
