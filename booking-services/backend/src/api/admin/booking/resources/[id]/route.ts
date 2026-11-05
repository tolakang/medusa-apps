import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { updateBookingResourceWorkflow } from "../../../../../workflows/booking-resource"
import type { PostAdminBookingResourceUpdateType } from "../../validators"
import { RESOURCE_FIELDS } from "../route"

// GET/POST /admin/booking/resources/:id (TASKS P3-11). POST replaces the
// weekly hours and offered services when they're sent.
const load = async (req: MedusaRequest, id: string) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [resource],
  } = await query.graph({ entity: "booking_resource", fields: RESOURCE_FIELDS, filters: { id } })
  if (!resource) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Booking resource ${id} was not found.`)
  }
  return resource
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.json({ resource: await load(req, req.params.id) })
}

export const POST = async (req: MedusaRequest<PostAdminBookingResourceUpdateType>, res: MedusaResponse) => {
  await updateBookingResourceWorkflow(req.scope).run({ input: { ...req.validatedBody, id: req.params.id } })
  res.json({ resource: await load(req, req.params.id) })
}
