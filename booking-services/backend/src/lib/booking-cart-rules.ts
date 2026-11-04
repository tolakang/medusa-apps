// Rules for booking line items (TASKS P3-05). Pure functions, so they're
// unit-tested on their own (src/lib/__tests__/booking-cart-rules.unit.spec.ts);
// src/workflows/hooks/booking-cart.ts loads the data and applies them.
// Metadata keys come from add-booking-to-cart (P3-04).

export const BOOKING_METADATA_KEYS = [
  "booking_id",
  "booking_resource_id",
  "booking_starts_at",
  "booking_ends_at",
] as const

export type BookingItemMetadata = Record<string, unknown> | null | undefined

export type BookingRow = {
  id: string
  status: string
  cart_id: string | null
  resource_id: string
  starts_at: Date | string
  ends_at: Date | string
  hold_expires_at: Date | string | null
}

export function bookingIdOf(metadata: BookingItemMetadata): string | null {
  const id = metadata?.booking_id
  return typeof id === "string" && id.length > 0 ? id : null
}

const sameInstant = (a: unknown, b: Date | string) =>
  typeof a === "string" && new Date(a).getTime() === new Date(b).getTime()

// Is this booking the one the line item claims, held for this cart?
// Returns a customer-facing message, or null when it matches.
export function bookingItemMismatch(
  metadata: BookingItemMetadata,
  booking: BookingRow | undefined,
  cartId: string
): string | null {
  if (!booking || booking.cart_id !== cartId) {
    return "This booking isn't held for this cart. Please choose the time again."
  }
  if (
    metadata?.booking_resource_id !== booking.resource_id ||
    !sameInstant(metadata?.booking_starts_at, booking.starts_at) ||
    !sameInstant(metadata?.booking_ends_at, booking.ends_at)
  ) {
    return "This booking's details don't match its hold. Please choose the time again."
  }
  return null
}

export type HoldState =
  | "valid" // pending and not expired, or already confirmed (a retried checkout)
  | "expired_hold" // pending, but hold_expires_at has passed: re-check the slot
  | "released" // cancelled or expired: the slot is gone

export function holdState(booking: BookingRow, now: Date): HoldState {
  if (booking.status === "confirmed") {
    return "valid"
  }
  if (booking.status === "pending") {
    if (!booking.hold_expires_at || new Date(booking.hold_expires_at).getTime() > now.getTime()) {
      return "valid"
    }
    return "expired_hold"
  }
  return "released"
}

// Booking items are one place each (TASKS F-045): their quantity stays 1
// and their booking metadata can't be changed.
export function bookingItemUpdateProblem(
  current: BookingItemMetadata,
  update: { quantity?: unknown; metadata?: BookingItemMetadata }
): string | null {
  if (!bookingIdOf(current)) {
    return null
  }
  if (update.quantity !== undefined && Number(update.quantity) !== 1) {
    return "A booking is for one place. Book another time to add more."
  }
  if (update.metadata !== undefined) {
    for (const key of BOOKING_METADATA_KEYS) {
      if (update.metadata?.[key] !== current?.[key]) {
        return "A booking's time can't be changed in the cart. Remove it and book again."
      }
    }
  }
  return null
}
