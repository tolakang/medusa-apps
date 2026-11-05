import { cancelDecision } from "../booking-cancel-policy"

// TASKS P3-08 / P3-16: the cancellation policy.
const now = new Date("2026-11-04T10:00:00Z")
const inHours = (h: number) => new Date(now.getTime() + h * 3600 * 1000)

describe("cancelDecision", () => {
  it("refunds a confirmed booking cancelled at least cancelHours before it starts", () => {
    expect(cancelDecision({ status: "confirmed", starts_at: inHours(48) }, now, 24)).toEqual({
      allowed: true,
      refund: true,
    })
    expect(cancelDecision({ status: "confirmed", starts_at: inHours(24) }, now, 24)).toEqual({
      allowed: true,
      refund: true,
    })
  })

  it("cancels without a refund inside the last cancelHours", () => {
    expect(cancelDecision({ status: "confirmed", starts_at: inHours(23.9) }, now, 24)).toEqual({
      allowed: true,
      refund: false,
    })
  })

  it("never refunds a pending hold (nothing was paid)", () => {
    expect(cancelDecision({ status: "pending", starts_at: inHours(72) }, now, 24)).toEqual({
      allowed: true,
      refund: false,
    })
  })

  it("with cancelHours 0, refunds any cancellation before the start", () => {
    expect(cancelDecision({ status: "confirmed", starts_at: inHours(0.01) }, now, 0)).toEqual({
      allowed: true,
      refund: true,
    })
  })

  it("refuses a booking that has started or isn't active", () => {
    expect(cancelDecision({ status: "confirmed", starts_at: now }, now, 24)).toEqual({
      allowed: false,
      message: "This booking has already started.",
    })
    for (const status of ["cancelled", "expired", "completed", "no_show"]) {
      expect(cancelDecision({ status, starts_at: inHours(48) }, now, 24)).toEqual({
        allowed: false,
        message: "This booking can't be cancelled.",
      })
    }
  })
})
