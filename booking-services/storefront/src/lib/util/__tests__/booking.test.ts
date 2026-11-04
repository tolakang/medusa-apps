import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import {
  durationMinutes,
  formatBookingRange,
  formatSlotTime,
  isServiceOnlyCart,
  itemBooking,
  localDate,
} from "../booking.ts"

// TASKS P3-13: the storefront's booking helpers.
const PP = "Asia/Phnom_Penh"

describe("booking helpers", () => {
  it("reads a service variant's length", () => {
    assert.equal(durationMinutes({ metadata: { duration_minutes: 60 } }), 60)
    assert.equal(durationMinutes({ metadata: { duration_minutes: "30" } }), 30)
    assert.equal(durationMinutes({ metadata: { duration_minutes: 0 } }), null)
    assert.equal(durationMinutes({ metadata: null }), null)
    assert.equal(durationMinutes(undefined), null)
  })

  it("knows a cart of services only", () => {
    const item = (requires_shipping: boolean) => ({ requires_shipping }) as never
    assert.equal(isServiceOnlyCart({ items: [item(false), item(false)] }), true)
    assert.equal(isServiceOnlyCart({ items: [item(false), item(true)] }), false)
    assert.equal(isServiceOnlyCart({ items: [] }), false)
    assert.equal(isServiceOnlyCart(null), false)
  })

  it("reads a booking line item", () => {
    assert.deepEqual(
      itemBooking({
        metadata: {
          booking_id: "book_1",
          booking_starts_at: "2026-11-09T03:00:00.000Z",
          booking_ends_at: "2026-11-09T04:00:00.000Z",
          booking_resource_name: "Sophea",
          booking_timezone: PP,
        },
      }),
      { starts_at: "2026-11-09T03:00:00.000Z", ends_at: "2026-11-09T04:00:00.000Z", resource: "Sophea", timezone: PP }
    )
    assert.equal(itemBooking({ metadata: { note: "x" } }), null)
    assert.equal(itemBooking(null), null)
  })

  it("formats times in the resource's zone, the same on every runtime", () => {
    assert.equal(formatBookingRange("2026-11-09T03:00:00.000Z", "2026-11-09T04:00:00.000Z", PP), "Mon 9 Nov, 10:00–11:00")
    assert.equal(formatSlotTime("2026-11-09T03:00:00.000Z", PP), "10:00")
    assert.equal(localDate(PP, 0, new Date("2026-11-08T18:00:00Z")), "2026-11-09")
    assert.equal(localDate(PP, 1, new Date("2026-11-08T18:00:00Z")), "2026-11-10")
  })
})
