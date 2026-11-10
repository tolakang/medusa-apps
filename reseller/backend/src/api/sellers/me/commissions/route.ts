import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MathBN, MedusaError } from "@medusajs/framework/utils"
import { SELLER_MODULE } from "../../../../modules/seller"
import SellerModuleService from "../../../../modules/seller/service"
import { GetSellerCommissions } from "../../validators"

// GET /sellers/me/commissions (plan §6.5, TASKS P5-06): the seller's own
// commissions, newest first, with totals per status and currency.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  // A small custom query: parsed here (MEDUSA_SKILL §7, as POS pos-query.ts).
  const parsed = GetSellerCommissions.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
    )
  }
  const { status, limit, offset } = parsed.data
  const sellers = req.scope.resolve<SellerModuleService>(SELLER_MODULE)
  const filters = {
    seller_id: req.auth_context.actor_id,
    ...(status ? { status } : {}),
  }
  const [commissions, count] = await sellers.listAndCountSellerCommissions(filters, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
    select: [
      "id",
      "order_id",
      "order_total",
      "rate",
      "amount",
      "currency_code",
      "status",
      "paid_at",
      "created_at",
    ],
  })

  const all = await sellers.listSellerCommissions(
    { seller_id: req.auth_context.actor_id },
    { select: ["status", "currency_code", "amount"] }
  )
  const totals: Record<string, Record<string, number>> = {}
  for (const c of all) {
    totals[c.status] ??= {}
    totals[c.status][c.currency_code] = MathBN.convert(
      MathBN.add(totals[c.status][c.currency_code] ?? 0, c.amount),
      2
    ).toNumber()
  }

  res.json({ commissions, count, limit, offset, totals })
}
