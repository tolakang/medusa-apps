import { model } from "@medusajs/framework/utils"
import { Booking } from "./booking"
import { BookingSchedule } from "./booking-schedule"

// Something that can be booked: a person, a room, a piece of equipment or a
// venue (BUILD_PLAN §6.3, TASKS P3-01). Which services (product variants) it
// offers is a module link (P3-02); no columns on core tables.
export const BookingResource = model
  .define("booking_resource", {
    id: model.id({ prefix: "bres" }).primaryKey(),
    name: model.text(),
    type: model.enum(["staff", "room", "equipment", "venue"]),
    // How many bookings may overlap at one time (1 for a person, more for a
    // class or a room with seats). Checked by isSlotAvailable (P3-03).
    capacity: model.number().default(1),
    // IANA time zone of the schedule, e.g. "Asia/Phnom_Penh". Weekly hours
    // are local to this zone; booking times are stored in UTC.
    timezone: model.text(),
    is_active: model.boolean().default(true),
    schedules: model.hasMany(() => BookingSchedule, {
      mappedBy: "resource",
    }),
    bookings: model.hasMany(() => Booking, {
      mappedBy: "resource",
    }),
  })
  // Weekly hours belong to the resource; bookings are kept as history.
  .cascades({ delete: ["schedules"] })
  .checks([
    {
      name: "booking_resource_capacity_positive",
      expression: (columns) => `${columns.capacity} >= 1`,
    },
  ])
