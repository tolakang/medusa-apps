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

// "YYYY-MM-DD" + "HH:MM" local to the time zone → that instant in UTC
// (TASKS P3-10). Two passes, so a daylight-saving change on that day is
// handled: the first guess uses the zone's offset at the naive UTC time, the
// second the offset at the corrected time.
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number)
  const [h, mi] = time.split(":").map(Number)
  const naive = Date.UTC(y, mo - 1, d, h, mi)
  const offsetAt = (at: number) => {
    const l = toLocalTime(new Date(at), timeZone)
    const [ly, lmo, ld] = l.date.split("-").map(Number)
    const [lh, lmi] = l.time.split(":").map(Number)
    return Date.UTC(ly, lmo - 1, ld, lh, lmi) - at
  }
  const first = naive - offsetAt(naive)
  const second = naive - offsetAt(first)
  return new Date(second)
}

// Weekday (0 = Sunday) of a calendar date, independent of any time zone.
export function weekdayOf(date: string): number {
  const [y, mo, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
}

// Back-to-back slots of `minutes` inside each opening range of that weekday,
// as UTC instants. A range shorter than one slot gives none.
export function candidateSlots(
  date: string,
  timeZone: string,
  hours: WeeklyHours[],
  minutes: number
): Interval[] {
  const weekday = weekdayOf(date)
  const slots: Interval[] = []
  for (const h of hours.filter((x) => x.weekday === weekday).sort((a, b) => a.start_time.localeCompare(b.start_time))) {
    const open = zonedTimeToUtc(date, h.start_time, timeZone).getTime()
    const close = zonedTimeToUtc(date, h.end_time, timeZone).getTime()
    for (let s = open; s + minutes * 60_000 <= close; s += minutes * 60_000) {
      slots.push({ starts_at: new Date(s), ends_at: new Date(s + minutes * 60_000) })
    }
  }
  return slots
}
