import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { SELLER_MODULE } from "../../../modules/seller"
import { summarizeBySeller } from "../../../modules/seller/payout"
import SellerModuleService from "../../../modules/seller/service"

// GET /admin/seller-payouts (TASKS P5-05): the payout report. `due` =
// approved commissions (to pay now), `pending` = not yet approved (next
// payout day), per seller and currency.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const sellers = req.scope.resolve<SellerModuleService>(SELLER_MODULE)
  const [approved, pending, all] = await Promise.all([
    sellers.listSellerCommissions({ status: "approved" }),
    sellers.listSellerCommissions({ status: "pending" }),
    sellers.listSellers({}),
  ])
  const names = new Map(all.map((s) => [s.id, { handle: s.handle, name: s.name }]))
  const withNames = (lines: ReturnType<typeof summarizeBySeller>) =>
    lines.map((line) => ({ ...line, seller: names.get(line.seller_id) ?? null }))
  const asLines = (list: typeof approved) =>
    summarizeBySeller(
      list.map((c) => ({
        seller_id: c.seller_id,
        currency_code: c.currency_code,
        amount: Number(c.amount),
      }))
    )
  res.json({ due: withNames(asLines(approved)), pending: withNames(asLines(pending)) })
}
