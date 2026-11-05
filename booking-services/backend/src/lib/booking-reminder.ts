// The 24-hour booking reminder email (TASKS P3-09). Pure, unit-tested in
// src/lib/__tests__/booking-reminder.unit.spec.ts; rendered by the Resend
// provider (src/modules/resend/templates.ts).
import { escapeHtml } from "./order-notification"

export const BOOKING_REMINDER_TEMPLATE = "booking-reminder"

export type BookingReminderData = {
  booking: {
    id: string
    starts_at: string
    ends_at: string
    timezone: string
    resource_name: string
    customer_name?: string | null
  }
}

// e.g. "Tuesday 10 November 2026, 10:00–11:00" in the resource's time zone.
export function formatBookingTime(starts_at: string, ends_at: string, timeZone: string): string {
  // Built from parts: Intl's punctuation for the whole date differs between
  // Node / ICU versions (e.g. a comma after the weekday on Node 24).
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
      .formatToParts(new Date(starts_at))
      .map((p) => [p.type, p.value])
  )
  const day = `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`
  const time = (at: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
      new Date(at)
    )
  return `${day}, ${time(starts_at)}–${time(ends_at)}`
}

export function bookingReminderEmail(data: BookingReminderData) {
  const b = data.booking
  const when = formatBookingTime(b.starts_at, b.ends_at, b.timezone)
  const hello = b.customer_name ? `Hello ${escapeHtml(b.customer_name)},` : "Hello,"
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>See you soon</h2>
<p>${hello}</p>
<p>This is a reminder of your booking with <strong>${escapeHtml(b.resource_name)}</strong>:</p>
<p style="font-size:18px"><strong>${escapeHtml(when)}</strong></p>
<p style="font-size:13px;color:#555">Times are in ${escapeHtml(b.timezone)}. If you can't come, please cancel in your account.</p>
</body></html>`
  return { subject: `Reminder: ${b.resource_name}, ${when}`, html }
}
