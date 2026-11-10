import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { normalizeHost } from "../../../../modules/seller/host"

// GET /store/sellers/resolve?domain=<host> | ?handle=<handle> (plan §6.5,
// TASKS P5-07): the multi-tenant storefront asks, server-side, which seller
// a request belongs to and gets that seller's publishable key. Only active
// sellers; anything else is 404 and the storefront serves your own channel.
// A publishable key is public (it is sent by every browser), so returning it
// is safe. Store routes need a publishable key header (your own).
const Query = z
  .object({
    domain: z.string().max(253).optional(),
    handle: z.string().max(100).optional(),
  })
  .strict()
  .refine((q) => !!q.domain !== !!q.handle, "Give exactly one of domain or handle.")

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = Query.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      parsed.error.issues.map((issue) => issue.message).join("; ")
    )
  }
  const filters = parsed.data.domain
    ? { domain: normalizeHost(parsed.data.domain) ?? "" }
    : { handle: parsed.data.handle!.trim().toLowerCase() }

  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "seller",
    fields: [
      "handle",
      "name",
      "domain",
      "status",
      "sales_channel.id",
      "sales_channel.publishable_api_keys.token",
      "sales_channel.publishable_api_keys.revoked_at",
    ],
    filters: { ...filters, status: "active" },
  })
  const seller = data[0]
  const key = seller?.sales_channel?.publishable_api_keys?.find(
    (k) => k && !k.revoked_at
  )?.token
  if (!seller || !key) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "No active seller here.")
  }
  res.json({
    seller: { handle: seller.handle, name: seller.name, domain: seller.domain },
    publishable_key: key,
  })
}
