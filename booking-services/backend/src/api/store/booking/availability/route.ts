import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BOOKING_MODULE } from "../../../../modules/booking"
import type BookingModuleService from "../../../../modules/booking/service"
import { slotUnavailableMessage } from "../../../../modules/booking/service"
import { parseBookingQuery } from "../query"
import { GetBookingAvailability } from "../validators"

// GET /store/booking/availability?resource_id=&starts_at=&ends_at= (TASKS
// P3-10): can this time be booked? Same check as a hold (P3-03).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { resource_id, starts_at, ends_at } = parseBookingQuery(GetBookingAvailability, req.query)
  const booking = req.scope.resolve<BookingModuleService>(BOOKING_MODULE)
  const check = await booking.checkSlot({
    resource_id,
    starts_at: new Date(starts_at),
    ends_at: new Date(ends_at),
  })
  res.json({
    availability: check.available
      ? check
      : { ...check, message: slotUnavailableMessage(check.reason) },
  })
}
