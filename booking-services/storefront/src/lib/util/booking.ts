import { HttpTypes } from "@medusajs/types"

// Booking helpers shared by the product page, cart and checkout (TASKS P3-13).
// A service is a product whose variants have metadata.duration_minutes and
// no shipping (backend P3-12); a booking line item carries metadata
// booking_id, booking_starts_at, booking_ends_at, booking_resource_name and
// booking_timezone (add-booking-to-cart, P3-04 / P3-13).

type Meta = Record<string, unknown> | null | undefined

export function durationMinutes(variant: { metadata?: Meta } | null | undefined): number | null {
  const n = Number(variant?.metadata?.duration_minutes)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function isServiceProduct(product: HttpTypes.StoreProduct): boolean {
  return (product.variants ?? []).some((v) => durationMinutes(v) !== null)
}

// Every item is a booked service (no item needs shipping): checkout has no
// address or delivery step, only contact (backend F-048).
export function isServiceOnlyCart(cart: Pick<HttpTypes.StoreCart, "items"> | null | undefined): boolean {
  const items = cart?.items ?? []
  return items.length > 0 && items.every((i) => i.requires_shipping === false)
}

export type ItemBooking = { starts_at: string; ends_at: string; resource: string | null; timezone: string | null }

export function itemBooking(item: { metadata?: Meta } | null | undefined): ItemBooking | null {
  const m = item?.metadata
  if (typeof m?.booking_id !== "string" || typeof m?.booking_starts_at !== "string") {
    return null
  }
  return {
    starts_at: m.booking_starts_at,
    ends_at: String(m.booking_ends_at ?? m.booking_starts_at),
    resource: typeof m.booking_resource_name === "string" ? m.booking_resource_name : null,
    timezone: typeof m.booking_timezone === "string" ? m.booking_timezone : null,
  }
}

// "Mon 9 Nov, 10:00–11:00" in the given zone (the resource's), built from
// parts so the text is the same on every Node / browser version.
export function formatBookingRange(starts_at: string, ends_at: string, timeZone?: string | null): string {
  const zone = timeZone || undefined
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "short" })
      .formatToParts(new Date(starts_at))
      .map((p) => [p.type, p.value])
  )
  const time = (at: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
      new Date(at)
    )
  return `${parts.weekday} ${parts.day} ${parts.month}, ${time(starts_at)}–${time(ends_at)}`
}

export function formatSlotTime(at: string, timeZone?: string | null): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || undefined,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at))
}

// "YYYY-MM-DD" of `now` plus `days` in the zone (for the date picker).
export function localDate(timeZone: string | null | undefined, days = 0, now = new Date()): string {
  const at = new Date(now.getTime() + days * 24 * 3600 * 1000)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || undefined, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}
