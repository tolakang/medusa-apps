import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createPosRegisterWorkflow } from "../../../../workflows/pos-register"
import type { PostAdminPosRegisterType } from "../validators"

// GET/POST /admin/pos/registers (TASKS P2-06): admins list and set up
// registers, each with one stock location and one sales channel.

export const REGISTER_FIELDS = [
  "id",
  "name",
  "code",
  "is_active",
  "created_at",
  "stock_location.id",
  "stock_location.name",
  "sales_channel.id",
  "sales_channel.name",
]

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: registers } = await query.graph({
    entity: "pos_register",
    fields: REGISTER_FIELDS,
    pagination: { order: { name: "ASC" } },
  })
  res.json({ registers })
}

export const POST = async (req: MedusaRequest<PostAdminPosRegisterType>, res: MedusaResponse) => {
  const { result } = await createPosRegisterWorkflow(req.scope).run({ input: req.validatedBody })
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [register],
  } = await query.graph({ entity: "pos_register", fields: REGISTER_FIELDS, filters: { id: result.id } })
  res.status(201).json({ register })
}
