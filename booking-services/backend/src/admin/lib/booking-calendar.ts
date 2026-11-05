// Date logic of the admin Bookings page (TASKS P3-11). Pure, unit-tested in
// src/admin/lib/__tests__/booking-calendar.unit.spec.ts. Times are shown in
// the resource's own time zone, whatever the browser's zone is.
import { toLocalTime, zonedTimeToUtc } from "../../modules/booking/utils/slot"

export type CalendarView = "day" | "week"

export type CalendarBooking = {
  id: string
  status: string
  starts_at: string
  ends_at: string
  notes?: string | null
  customer?: { email: string | null; first_name: string | null; last_name: string | null } | null
  order?: { id: string; display_id: number | null } | null
}

const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// Monday-first week containing `date` ("YYYY-MM-DD").
export function weekDays(date: string): string[] {
  const [y, m, d] = date.split("-").map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  const monday = addDays(date, -((weekday + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export function shiftDate(date: string, view: CalendarView, steps: number): string {
  return addDays(date, steps * (view === "week" ? 7 : 1))
}

export function viewDays(date: string, view: CalendarView): string[] {
  return view === "week" ? weekDays(date) : [date]
}

// The UTC window of the shown day(s), from local midnight in the zone.
export function viewWindow(date: string, view: CalendarView, timeZone: string) {
  const days = viewDays(date, view)
  return {
    from: zonedTimeToUtc(days[0], "00:00", timeZone).toISOString(),
    to: zonedTimeToUtc(addDays(days[days.length - 1], 1), "00:00", timeZone).toISOString(),
  }
}

// Bookings per local day of the zone, in time order.
export function groupByLocalDay(
  bookings: CalendarBooking[],
  days: string[],
  timeZone: string
): Record<string, CalendarBooking[]> {
  const grouped: Record<string, CalendarBooking[]> = Object.fromEntries(days.map((d) => [d, []]))
  for (const b of [...bookings].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const day = toLocalTime(new Date(b.starts_at), timeZone).date
    if (grouped[day]) {
      grouped[day].push(b)
    }
  }
  return grouped
}

export function timeRange(b: { starts_at: string; ends_at: string }, timeZone: string): string {
  return `${toLocalTime(new Date(b.starts_at), timeZone).time}–${toLocalTime(new Date(b.ends_at), timeZone).time}`
}

export function customerLabel(b: CalendarBooking): string {
  const c = b.customer
  const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ")
  return name || c?.email || "Walk-in"
}

export const STATUS_COLOR: Record<string, "green" | "orange" | "grey" | "red" | "blue"> = {
  confirmed: "green",
  pending: "orange",
  completed: "blue",
  cancelled: "grey",
  expired: "grey",
  no_show: "red",
}

// Walk-in form: a local date and "HH:MM" in the resource's zone, plus a
// length, as the UTC instants the API takes.
export function walkInTimes(date: string, time: string, minutes: number, timeZone: string) {
  const starts = zonedTimeToUtc(date, time, timeZone)
  return {
    starts_at: starts.toISOString(),
    ends_at: new Date(starts.getTime() + minutes * 60_000).toISOString(),
  }
}

// Today's local date in the zone.
export function todayIn(timeZone: string, now = new Date()): string {
  return toLocalTime(now, timeZone).date
}
