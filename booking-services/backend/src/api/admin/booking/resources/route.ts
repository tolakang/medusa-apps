import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createBookingResourceWorkflow } from "../../../../workflows/booking-resource"
import type { PostAdminBookingResourceType } from "../validators"

// GET/POST /admin/booking/resources (TASKS P3-11): what can be booked, with
// its weekly hours and offered services.
export const RESOURCE_FIELDS = [
  "id",
  "name",
  "type",
  "capacity",
  "timezone",
  "is_active",
  "schedules.weekday",
  "schedules.start_time",
  "schedules.end_time",
  "product_variants.id",
  "product_variants.title",
  "product_variants.product.title",
]

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: resources } = await query.graph({
    entity: "booking_resource",
    fields: RESOURCE_FIELDS,
    pagination: { order: { name: "ASC" } },
  })
  res.json({ resources })
}

export const POST = async (req: MedusaRequest<PostAdminBookingResourceType>, res: MedusaResponse) => {
  const { result } = await createBookingResourceWorkflow(req.scope).run({ input: req.validatedBody })
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [resource],
  } = await query.graph({ entity: "booking_resource", fields: RESOURCE_FIELDS, filters: { id: result.id } })
  res.status(201).json({ resource })
}
