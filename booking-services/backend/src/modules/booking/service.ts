import { MedusaService } from "@medusajs/framework/utils"
import { Booking } from "./models/booking"
import { BookingResource } from "./models/booking-resource"
import { BookingSchedule } from "./models/booking-schedule"

// Generated CRUD only (TASKS P3-01). isSlotAvailable and createHold come in
// P3-03.
class BookingModuleService extends MedusaService({
  BookingResource,
  BookingSchedule,
  Booking,
}) {}

export default BookingModuleService
