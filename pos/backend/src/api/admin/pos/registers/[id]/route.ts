import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { updatePosRegisterWorkflow } from "../../../../../workflows/pos-register"
import type { PostAdminPosRegisterUpdateType } from "../../validators"
import { REGISTER_FIELDS } from "../route"

// GET/POST /admin/pos/registers/:id (TASKS P2-06): read or change a register
// (name, active, stock location, sales channel; links are replaced).

const getRegister = async (req: MedusaRequest, id: string) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [register],
  } = await query.graph({ entity: "pos_register", fields: REGISTER_FIELDS, filters: { id } })
  if (!register) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Register ${id} was not found.`)
  }
  return register
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.json({ register: await getRegister(req, req.params.id) })
}

export const POST = async (req: MedusaRequest<PostAdminPosRegisterUpdateType>, res: MedusaResponse) => {
  await updatePosRegisterWorkflow(req.scope).run({ input: { ...req.validatedBody, id: req.params.id } })
  res.json({ register: await getRegister(req, req.params.id) })
}
