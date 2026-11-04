import { model } from "@medusajs/framework/utils"
import { BookingResource } from "./booking-resource"

// One booked time slot of one resource (BUILD_PLAN §6.3, TASKS P3-01).
// Times are UTC. A booking starts as a `pending` hold while the customer
// checks out (hold_expires_at, P3-03/P3-06), becomes `confirmed` when the
// order is placed (P3-07, which also links it to the order, P3-02), or
// `expired` when the hold runs out (P3-09). One booking takes one place of
// the resource's capacity.
export const Booking = model
  .define("booking", {
    id: model.id({ prefix: "book" }).primaryKey(),
    starts_at: model.dateTime(),
    ends_at: model.dateTime(),
    status: model
      .enum(["pending", "confirmed", "cancelled", "expired", "completed", "no_show"])
      .default("pending"),
    // Only for `pending` holds: after this moment the hold no longer blocks
    // the slot, even before the release job marks it `expired`.
    hold_expires_at: model.dateTime().nullable(),
    // IDs from other modules, stored as plain text (no foreign keys into
    // core tables). Walk-in bookings (P3-11) may have no customer or cart.
    customer_id: model.text().nullable(),
    cart_id: model.text().nullable(),
    line_item_id: model.text().nullable(),
    notes: model.text().nullable(),
    resource: model.belongsTo(() => BookingResource, {
      mappedBy: "bookings",
    }),
  })
  .indexes([
    // Overlap checks read a resource's bookings around a time (P3-03).
    {
      name: "IDX_booking_resource_starts_at",
      on: ["resource_id", "starts_at"],
    },
    // Holds are found again by cart at checkout (P3-05, P3-07).
    {
      name: "IDX_booking_cart_id",
      on: ["cart_id"],
    },
  ])
  .checks([
    {
      name: "booking_ends_after_start",
      expression: (columns) => `${columns.ends_at} > ${columns.starts_at}`,
    },
  ])
