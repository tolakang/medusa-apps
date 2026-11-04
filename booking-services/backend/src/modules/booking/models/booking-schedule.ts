import { model } from "@medusajs/framework/utils"
import { BookingResource } from "./booking-resource"

// Weekly opening hours of a resource (BUILD_PLAN §6.3, TASKS P3-01): one row
// per weekday and time range, in the resource's own time zone. Several rows
// on one weekday make split hours (e.g. 09:00-12:00 and 13:00-17:00).
// The DML has no time-of-day type, so times are zero-padded "HH:MM" text;
// the checks keep them valid, and "HH:MM" compares correctly as text.
export const BookingSchedule = model
  .define("booking_schedule", {
    id: model.id({ prefix: "bsch" }).primaryKey(),
    // 0 = Sunday ... 6 = Saturday (JavaScript Date.getDay()).
    weekday: model.number(),
    start_time: model.text(),
    end_time: model.text(),
    resource: model.belongsTo(() => BookingResource, {
      mappedBy: "schedules",
    }),
  })
  .checks([
    {
      name: "booking_schedule_weekday_range",
      expression: (columns) => `${columns.weekday} BETWEEN 0 AND 6`,
    },
    {
      name: "booking_schedule_time_format",
      expression: (columns) =>
        `${columns.start_time} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ${columns.end_time} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    },
    {
      name: "booking_schedule_start_before_end",
      expression: (columns) => `${columns.start_time} < ${columns.end_time}`,
    },
  ])
