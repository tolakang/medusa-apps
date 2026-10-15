import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MathBN } from "@medusajs/framework/utils"
import { POS_MODULE } from "../../../../modules/pos"
import type PosModuleService from "../../../../modules/pos/service"
import { parsePosQuery } from "../../../pos-query"
import { GetAdminPosShifts } from "../validators"

// GET /admin/pos/shifts (TASKS P2-06): shift report data per register,
// cashier and day (the admin page is P2-07). Variance = counted − expected
// for closed shifts, as close-pos-shift returns it (P2-04).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const params = parsePosQuery(GetAdminPosShifts, req.query)
  const filters: Record<string, unknown> = {}
  if (params.register_id) filters.register_id = params.register_id
  if (params.cashier_id) filters.opened_by = params.cashier_id
  if (params.status) filters.status = params.status
  if (params.from || params.to) {
    filters.opened_at = {
      ...(params.from ? { $gte: params.from } : {}),
      ...(params.to ? { $lt: params.to } : {}),
    }
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data, metadata } = await query.graph({
    entity: "pos_shift",
    fields: [
      "id",
      "status",
      "currency_code",
      "opened_by",
      "closed_by",
      "opened_at",
      "closed_at",
      "opening_cash",
      "counted_cash",
      "expected_cash",
      "notes",
      "register.id",
      "register.name",
      "register.code",
    ],
    filters,
    pagination: { skip: params.offset, take: params.limit, order: { opened_at: "DESC" } },
  })

  const cashierIds = [...new Set(data.flatMap((s) => [s.opened_by, s.closed_by]).filter(Boolean) as string[])]
  const pos: PosModuleService = req.scope.resolve(POS_MODULE)
  const cashiers = cashierIds.length ? await pos.listPosCashiers({ id: cashierIds }) : []
  const names = new Map(cashiers.map((c) => [c.id, c.name]))

  const shifts = data.map((s) => ({
    ...s,
    opened_by_name: names.get(s.opened_by) ?? null,
    closed_by_name: s.closed_by ? (names.get(s.closed_by) ?? null) : null,
    variance:
      s.status === "closed" && s.counted_cash != null && s.expected_cash != null
        ? MathBN.sub(s.counted_cash as number, s.expected_cash as number).toNumber()
        : null,
  }))
  res.json({ shifts, count: metadata?.count ?? shifts.length, offset: params.offset, limit: params.limit })
}
