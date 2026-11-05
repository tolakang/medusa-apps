// The cancellation policy (TASKS P3-08, plan §6.3: BOOKING_CANCEL_HOURS).
// Pure, so it's unit-tested on its own.

export type CancelDecision =
  | { allowed: false; message: string }
  | { allowed: true; refund: boolean }

// A pending hold or a confirmed booking can be cancelled until it starts.
// It is refunded when cancelled at least `cancelHours` before the start.
export function cancelDecision(
  booking: { status: string; starts_at: Date | string },
  now: Date,
  cancelHours: number
): CancelDecision {
  if (booking.status !== "pending" && booking.status !== "confirmed") {
    return { allowed: false, message: "This booking can't be cancelled." }
  }
  const starts = new Date(booking.starts_at).getTime()
  if (starts <= now.getTime()) {
    return { allowed: false, message: "This booking has already started." }
  }
  const refund =
    booking.status === "confirmed" && starts - now.getTime() >= cancelHours * 3600 * 1000
  return { allowed: true, refund }
}
