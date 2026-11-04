import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import BookingModule from "../modules/booking"

// The order a booking was paid in (BUILD_PLAN §6.3, TASKS P3-02): many
// bookings, one order (a customer can book several slots in one checkout).
// The order.placed subscriber (P3-07) creates the link when it confirms the
// bookings. `isList` on the booking side = many bookings to one order.
export default defineLink(
  { linkable: BookingModule.linkable.booking, isList: true },
  OrderModule.linkable.order
)
