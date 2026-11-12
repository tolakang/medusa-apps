import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { telegramCustomerConfig, telegramStartUrl } from "../../../../../lib/telegram-customer"

// GET /store/orders/:id/telegram-link → { url } for the order page's "Get order
// updates on Telegram" button (TASKS P1-17). Store route: needs the
// publishable key. Like GET /store/orders/:id, knowing the order ID is the
// access check; the link is signed so it only works for this order.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const config = telegramCustomerConfig()
  if (!config) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Telegram order updates are not set up.")
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [order],
  } = await query.graph({ entity: "order", fields: ["id"], filters: { id: req.params.id } })
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order ${req.params.id} not found.`)
  }

  res.json({ url: telegramStartUrl(order.id, config) })
}
