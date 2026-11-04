// Pure helpers for the slot check (TASKS P3-03). No Medusa imports, so they
// are unit-tested on their own (src/modules/booking/__tests__/slot.unit.spec.ts).

export type LocalTime = {
  // Local calendar date "YYYY-MM-DD", weekday 0 = Sunday ... 6 = Saturday,
  // and zero-padded "HH:MM" (24 h), all in the given IANA time zone.
  date: string
  weekday: number
  time: string
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

// Throws RangeError for an unknown time zone (Intl's own check).
export function toLocalTime(at: Date, timeZone: string): LocalTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday],
    time: `${parts.hour}:${parts.minute}`,
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch {
    return false
  }
}

export type WeeklyHours = { weekday: number; start_time: string; end_time: string }

// The slot must start and end on the same local day and fit inside one of
// that weekday's opening ranges. "HH:MM" compares correctly as text.
export function fitsWeeklyHours(
  starts_at: Date,
  ends_at: Date,
  timeZone: string,
  hours: WeeklyHours[]
): boolean {
  const start = toLocalTime(starts_at, timeZone)
  const end = toLocalTime(ends_at, timeZone)
  if (start.date !== end.date) {
    return false
  }
  return hours.some(
    (h) => h.weekday === start.weekday && h.start_time <= start.time && end.time <= h.end_time
  )
}

export type Interval = { starts_at: Date; ends_at: Date }

// Largest number of the given bookings that overlap at one moment inside
// [from, to). Touching intervals (one ends when the next starts) don't
// overlap. This is what a capacity limit is about: with capacity 2, bookings
// 10:00-11:00 and 11:00-12:00 still leave room for 10:00-12:00.
export function peakOverlap(intervals: Interval[], from: Date, to: Date): number {
  const events: [number, number][] = []
  for (const i of intervals) {
    const s = Math.max(i.starts_at.getTime(), from.getTime())
    const e = Math.min(i.ends_at.getTime(), to.getTime())
    if (s < e) {
      events.push([s, 1], [e, -1])
    }
  }
  // Ends before starts at the same instant, so touching intervals don't add up.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let current = 0
  let peak = 0
  for (const [, delta] of events) {
    current += delta
    peak = Math.max(peak, current)
  }
  return peak
}
