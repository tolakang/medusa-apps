import {
  bookingIdOf,
  bookingItemMismatch,
  bookingItemUpdateProblem,
  holdState,
  type BookingRow,
} from "../booking-cart-rules"

// TASKS P3-05: the rules behind the cart hooks.
const STARTS = "2026-11-20T03:00:00.000Z"
const ENDS = "2026-11-20T04:00:00.000Z"
const row = (over: Partial<BookingRow> = {}): BookingRow => ({
  id: "book_1",
  status: "pending",
  cart_id: "cart_1",
  resource_id: "bres_1",
  starts_at: new Date(STARTS),
  ends_at: new Date(ENDS),
  hold_expires_at: new Date("2026-11-04T10:15:00Z"),
  ...over,
})
const meta = {
  booking_id: "book_1",
  booking_resource_id: "bres_1",
  booking_starts_at: STARTS,
  booking_ends_at: ENDS,
}

describe("bookingIdOf", () => {
  it("reads a non-empty booking_id only", () => {
    expect(bookingIdOf(meta)).toEqual("book_1")
    expect(bookingIdOf({ booking_id: "" })).toBeNull()
    expect(bookingIdOf({ booking_id: 5 })).toBeNull()
    expect(bookingIdOf(null)).toBeNull()
    expect(bookingIdOf(undefined)).toBeNull()
  })
})

describe("bookingItemMismatch", () => {
  it("accepts the hold of this cart with the same resource and times", () => {
    expect(bookingItemMismatch(meta, row(), "cart_1")).toBeNull()
  })

  it("refuses a missing booking or one held for another cart", () => {
    expect(bookingItemMismatch(meta, undefined, "cart_1")).toMatch(/isn't held for this cart/)
    expect(bookingItemMismatch(meta, row({ cart_id: "cart_2" }), "cart_1")).toMatch(
      /isn't held for this cart/
    )
    expect(bookingItemMismatch(meta, row({ cart_id: null }), "cart_1")).toMatch(
      /isn't held for this cart/
    )
  })

  it("refuses metadata that doesn't match the hold", () => {
    for (const changed of [
      { booking_resource_id: "bres_2" },
      { booking_starts_at: "2026-11-20T02:00:00.000Z" },
      { booking_ends_at: "2026-11-20T05:00:00.000Z" },
      { booking_starts_at: undefined },
    ]) {
      expect(bookingItemMismatch({ ...meta, ...changed }, row(), "cart_1")).toMatch(/don't match/)
    }
  })
})

describe("holdState", () => {
  const now = new Date("2026-11-04T10:00:00Z")

  it("is valid for an unexpired pending hold or a confirmed booking", () => {
    expect(holdState(row(), now)).toEqual("valid")
    expect(holdState(row({ hold_expires_at: null }), now)).toEqual("valid")
    expect(holdState(row({ status: "confirmed", hold_expires_at: new Date(0) }), now)).toEqual("valid")
  })

  it("is expired_hold once hold_expires_at has passed", () => {
    expect(holdState(row({ hold_expires_at: new Date("2026-11-04T09:59:59Z") }), now)).toEqual(
      "expired_hold"
    )
    expect(holdState(row({ hold_expires_at: now }), now)).toEqual("expired_hold")
  })

  it("is released for cancelled, expired and other statuses", () => {
    for (const status of ["cancelled", "expired", "completed", "no_show"]) {
      expect(holdState(row({ status }), now)).toEqual("released")
    }
  })
})

describe("bookingItemUpdateProblem", () => {
  it("leaves items without a booking alone", () => {
    expect(bookingItemUpdateProblem({ note: "x" }, { quantity: 5 })).toBeNull()
    expect(bookingItemUpdateProblem(null, { metadata: { booking_id: "book_9" } })).toBeNull()
  })

  it("keeps a booking item at quantity 1", () => {
    expect(bookingItemUpdateProblem(meta, { quantity: 1 })).toBeNull()
    expect(bookingItemUpdateProblem(meta, { quantity: "1" })).toBeNull()
    expect(bookingItemUpdateProblem(meta, { quantity: 2 })).toMatch(/one place/)
    expect(bookingItemUpdateProblem(meta, { quantity: 0 })).toMatch(/one place/)
  })

  it("refuses changes to the booking metadata, allows the same values", () => {
    expect(bookingItemUpdateProblem(meta, { metadata: { ...meta, gift: true } })).toBeNull()
    expect(
      bookingItemUpdateProblem(meta, { metadata: { ...meta, booking_starts_at: ENDS } })
    ).toMatch(/can't be changed/)
    expect(bookingItemUpdateProblem(meta, { metadata: {} })).toMatch(/can't be changed/)
  })
})
