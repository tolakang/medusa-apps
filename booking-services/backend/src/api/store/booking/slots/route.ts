import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../../modules/booking"
import type BookingModuleService from "../../../../modules/booking/service"
import { parseBookingQuery } from "../query"
import { GetBookingSlots } from "../validators"

// GET /store/booking/slots?variant_id=&date=YYYY-MM-DD[&resource_id=][&duration_minutes=]
// (duration defaults to the variant's metadata.duration_minutes, else 60)
// (TASKS P3-10): free slots for a service on a date, from every active
// resource that offers it (link P3-02), or one of them. Each slot carries its
// resource, so the storefront can add it with POST /store/booking/cart.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { variant_id, date, resource_id, duration_minutes: asked } = parseBookingQuery(GetBookingSlots, req.query)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [variant],
  } = await query.graph({
    entity: "product_variant",
    fields: ["id", "metadata", "booking_resources.id", "booking_resources.name", "booking_resources.timezone"],
    filters: { id: variant_id },
  })
  if (!variant) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Variant ${variant_id} was not found.`)
  }
  // A service variant's length (P3-12), unless the query asks for another.
  const fromVariant = Number((variant.metadata as Record<string, unknown> | null)?.duration_minutes)
  const duration_minutes =
    asked ?? (Number.isInteger(fromVariant) && fromVariant >= 5 && fromVariant <= 720 ? fromVariant : 60)
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
