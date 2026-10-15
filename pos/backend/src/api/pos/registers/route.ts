import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { POS_MODULE } from "../../../modules/pos"
import type PosModuleService from "../../../modules/pos/service"

// GET /pos/registers (TASKS P2-06): the active registers a cashier can pick,
// with their stock location, sales channel and open shift (if any).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "pos_register",
    fields: ["id", "name", "code", "stock_location.id", "stock_location.name", "sales_channel.id", "sales_channel.name"],
    filters: { is_active: true },
    pagination: { order: { name: "ASC" } },
  })
  const pos: PosModuleService = req.scope.resolve(POS_MODULE)
  const open = data.length
    ? await pos.listPosShifts({ status: "open", register_id: data.map((r) => r.id) })
    : []
  const registers = data.map((r) => ({ ...r, open_shift: open.find((s) => s.register_id === r.id) ?? null }))
  res.json({ registers })
}
