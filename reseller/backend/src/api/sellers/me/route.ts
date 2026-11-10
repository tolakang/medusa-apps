import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /sellers/me (plan §6.5; TASKS P5-03): the signed-in seller and their
// sales channel. P5-06 adds products and commissions.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const {
    data: [seller],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    {
      entity: "seller",
      fields: [
        "id",
        "handle",
        "name",
        "email",
        "domain",
        "status",
        "commission_rate",
        "sales_channel.id",
        "sales_channel.name",
      ],
      filters: { id: req.auth_context.actor_id },
    },
    { throwIfKeyNotFound: true }
  )
  res.json({ seller })
}
