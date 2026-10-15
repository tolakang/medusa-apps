import {
  authenticate,
  type AuthenticatedMedusaRequest,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError, parseCorsOrigins } from "@medusajs/framework/utils"
import cors from "cors"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"

// Access to /pos/* (BUILD_PLAN §6.2, TASKS P2-03). Medusa's own CORS covers only
// /store, /admin and /auth (docs "Handling CORS in API Routes"), so /pos gets
// the docs' cors + parseCorsOrigins middleware with POS_CORS.
export function posCors(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  return cors({ origin: parseCorsOrigins(process.env.POS_CORS ?? ""), credentials: true })(
    req,
    res,
    next
  )
}

// The only /pos route a registration token (no cashier yet) may call.
export const ACCEPT_INVITE_PATH = "/pos/cashiers/accept"

const cashierAuth = authenticate("cashier", ["session", "bearer"])
const registrationAuth = authenticate("cashier", ["bearer"], { allowUnregistered: true })

export const CASHIER_INACTIVE_MESSAGE = "This cashier account is not active."

// Every /pos route needs a signed-in, active cashier, so a new route is
// protected without listing it here. Admin users and customers are refused
// (different actor types). A deactivated cashier's existing token stops
// working at once.
export function requireCashier(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const path = (req.originalUrl ?? req.url).split("?")[0]
  if (path === ACCEPT_INVITE_PATH) {
    return registrationAuth(req, res, next)
  }
  return cashierAuth(req, res, (err?: unknown) => {
    if (err) {
      return next(err)
    }
    requireActiveCashier(req as AuthenticatedMedusaRequest).then(
      () => next(),
      (e) => next(e)
    )
  })
}

async function requireActiveCashier(req: AuthenticatedMedusaRequest) {
  const pos: PosModuleService = req.scope.resolve(POS_MODULE)
  const [cashier] = await pos.listPosCashiers({ id: req.auth_context.actor_id })
  if (!cashier?.is_active) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, CASHIER_INACTIVE_MESSAGE)
  }
}
