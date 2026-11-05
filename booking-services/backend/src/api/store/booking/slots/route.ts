import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../../modules/booking"
import type BookingModuleService from "../../../../modules/booking/service"
import { parseBookingQuery } from "../query"
import { GetBookingSlots } from "../validators"

// GET /store/booking/slots?variant_id=&date=YYYY-MM-DD[&resource_id=][&duration_minutes=60]
// (TASKS P3-10): free slots for a service on a date, from every active
// resource that offers it (link P3-02), or one of them. Each slot carries its
// resource, so the storefront can add it with POST /store/booking/cart.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { variant_id, date, resource_id, duration_minutes } = parseBookingQuery(GetBookingSlots, req.query)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [variant],
  } = await query.graph({
    entity: "product_variant",
    fields: ["id", "booking_resources.id", "booking_resources.name", "booking_resources.timezone"],
    filters: { id: variant_id },
  })
  if (!variant) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Variant ${variant_id} was not found.`)
  }
  const offering = (variant.booking_resources ?? []).filter(Boolean)
  const resources = resource_id ? offering.filter((r) => r!.id === resource_id) : offering
  if (resource_id && !resources.length) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This resource doesn't offer this service.")
  }

  const booking = req.scope.resolve<BookingModuleService>(BOOKING_MODULE)
  const free = await booking.listFreeSlots({
    resource_ids: resources.map((r) => r!.id),
    date,
    duration_minutes,
  })
  const byId = new Map(resources.map((r) => [r!.id, r!]))
  res.json({
    date,
    duration_minutes,
    slots: free.map((s) => ({
      resource_id: s.resource_id,
      resource_name: byId.get(s.resource_id)?.name,
      timezone: byId.get(s.resource_id)?.timezone,
      starts_at: s.starts_at.toISOString(),
      ends_at: s.ends_at.toISOString(),
      remaining: s.remaining,
    })),
  })
}
