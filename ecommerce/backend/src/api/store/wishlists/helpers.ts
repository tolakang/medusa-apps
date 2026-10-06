import type {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaStoreRequest,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// Wishlists live in the sales channel of the request's publishable key
// (wishlist guide; store routes require the key).
export function requestSalesChannel(req: AuthenticatedMedusaRequest | MedusaStoreRequest): string {
  const channel = req.publishable_key_context?.sales_channel_ids?.[0]
  if (!channel) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The publishable API key must belong to a sales channel."
    )
  }
  return channel
}

// The project's JWT secret (JWT_SECRET, a string in medusa-config.ts) keys the
// wishlist share links (src/lib/wishlist-share.ts).
export function shareSecret(req: MedusaRequest): string {
  const { http } = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig
  if (typeof http.jwtSecret !== "string" || !http.jwtSecret) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "JWT_SECRET is not set.")
  }
  return http.jwtSecret
}
