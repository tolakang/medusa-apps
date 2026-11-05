import {
  candidateSlots,
  fitsWeeklyHours,
  isValidTimeZone,
  peakOverlap,
  toLocalTime,
  weekdayOf,
  zonedTimeToUtc,
} from "../slot"

// TASKS P3-03: the pure parts of the slot check.
const at = (iso: string) => new Date(iso)
const PP = "Asia/Phnom_Penh" // UTC+7, no daylight saving

describe("toLocalTime", () => {
  it("gives the local date, weekday and time in the resource's zone", () => {
    // Monday 2026-11-09 09:30 in Phnom Penh = 02:30 UTC.
    expect(toLocalTime(at("2026-11-09T02:30:00Z"), PP)).toEqual({
      date: "2026-11-09",
      weekday: 1,
      time: "09:30",
    })
    // 23:30 UTC Sunday is already Monday 06:30 in Phnom Penh.
    expect(toLocalTime(at("2026-11-08T23:30:00Z"), PP)).toEqual({
      date: "2026-11-09",
      weekday: 1,
      time: "06:30",
    })
    // Midnight is "00:00", not "24:00".
    expect(toLocalTime(at("2026-11-08T17:00:00Z"), PP).time).toEqual("00:00")
  })

  it("follows daylight saving in zones that have it", () => {
    expect(toLocalTime(at("2026-07-01T07:00:00Z"), "Europe/Berlin").time).toEqual("09:00")
    expect(toLocalTime(at("2026-12-01T08:00:00Z"), "Europe/Berlin").time).toEqual("09:00")
  })
})

describe("isValidTimeZone", () => {
  it("accepts IANA zones and refuses unknown ones", () => {
    expect(isValidTimeZone(PP)).toBe(true)
    expect(isValidTimeZone("UTC")).toBe(true)
    expect(isValidTimeZone("Mars/Olympus")).toBe(false)
  })
})

describe("fitsWeeklyHours", () => {
  const hours = [
    { weekday: 1, start_time: "09:00", end_time: "12:00" },
    { weekday: 1, start_time: "13:00", end_time: "17:00" },
  ]
  const fits = (starts: string, ends: string) => fitsWeeklyHours(at(starts), at(ends), PP, hours)

  it("accepts a slot inside one range, including its edges", () => {
    expect(fits("2026-11-09T02:00:00Z", "2026-11-09T03:00:00Z")).toBe(true) // 09-10
    expect(fits("2026-11-09T04:00:00Z", "2026-11-09T05:00:00Z")).toBe(true) // 11-12
    expect(fits("2026-11-09T06:00:00Z", "2026-11-09T10:00:00Z")).toBe(true) // 13-17
  })

  it("refuses a slot outside the hours, across the lunch gap or on a closed day", () => {
    expect(fits("2026-11-09T01:30:00Z", "2026-11-09T02:30:00Z")).toBe(false) // 08:30
    expect(fits("2026-11-09T09:30:00Z", "2026-11-09T10:30:00Z")).toBe(false) // to 17:30
    expect(fits("2026-11-09T04:30:00Z", "2026-11-09T06:30:00Z")).toBe(false) // 11:30-13:30
    expect(fits("2026-11-10T02:00:00Z", "2026-11-10T03:00:00Z")).toBe(false) // Tuesday
  })

  it("refuses a slot that crosses local midnight", () => {
    const late = [{ weekday: 1, start_time: "20:00", end_time: "23:59" }]
    // Monday 23:00 to Tuesday 00:30 local.
    expect(fitsWeeklyHours(at("2026-11-09T16:00:00Z"), at("2026-11-09T17:30:00Z"), PP, late)).toBe(
      false
    )
  })
})

describe("peakOverlap", () => {
  const i = (s: string, e: string) => ({
    starts_at: at(`2026-11-09T${s}:00Z`),
    ends_at: at(`2026-11-09T${e}:00Z`),
  })
  const from = at("2026-11-09T02:00:00Z")
  const to = at("2026-11-09T04:00:00Z")

  it("is 0 with no bookings, or bookings outside the window", () => {
    expect(peakOverlap([], from, to)).toBe(0)
    expect(peakOverlap([i("00:00", "02:00"), i("04:00", "05:00")], from, to)).toBe(0)
  })

  it("doesn't add up bookings that only touch", () => {
    expect(peakOverlap([i("02:00", "03:00"), i("03:00", "04:00")], from, to)).toBe(1)
  })

  it("counts bookings that overlap each other", () => {
    expect(peakOverlap([i("02:00", "03:30"), i("03:00", "04:00")], from, to)).toBe(2)
    expect(peakOverlap([i("01:00", "05:00"), i("02:30", "03:00"), i("02:45", "03:15")], from, to)).toBe(3)
  })
})

describe("zonedTimeToUtc / weekdayOf (P3-10)", () => {
  it("turns a local time into UTC", () => {
    expect(zonedTimeToUtc("2026-11-09", "09:00", PP).toISOString()).toEqual("2026-11-09T02:00:00.000Z")
    expect(zonedTimeToUtc("2026-11-09", "00:00", PP).toISOString()).toEqual("2026-11-08T17:00:00.000Z")
    expect(zonedTimeToUtc("2026-11-09", "09:00", "UTC").toISOString()).toEqual("2026-11-09T09:00:00.000Z")
  })

  it("handles daylight saving on the day it changes", () => {
    // Berlin moves from UTC+1 to UTC+2 at 02:00 on 2026-03-29.
    expect(zonedTimeToUtc("2026-03-29", "01:00", "Europe/Berlin").toISOString()).toEqual("2026-03-29T00:00:00.000Z")
    expect(zonedTimeToUtc("2026-03-29", "09:00", "Europe/Berlin").toISOString()).toEqual("2026-03-29T07:00:00.000Z")
    expect(zonedTimeToUtc("2026-07-01", "09:00", "Europe/Berlin").toISOString()).toEqual("2026-07-01T07:00:00.000Z")
    expect(zonedTimeToUtc("2026-12-01", "09:00", "Europe/Berlin").toISOString()).toEqual("2026-12-01T08:00:00.000Z")
  })

  it("knows the weekday of a calendar date", () => {
    expect(weekdayOf("2026-11-08")).toEqual(0)
    expect(weekdayOf("2026-11-09")).toEqual(1)
    expect(weekdayOf("2026-11-14")).toEqual(6)
  })
})

describe("candidateSlots (P3-10)", () => {
  const hours = [
    { weekday: 1, start_time: "13:00", end_time: "15:00" },
    { weekday: 1, start_time: "09:00", end_time: "11:30" },
    { weekday: 2, start_time: "09:00", end_time: "17:00" },
  ]
  const iso = (slots: { starts_at: Date; ends_at: Date }[]) =>
    slots.map((x) => `${x.starts_at.toISOString().slice(11, 16)}-${x.ends_at.toISOString().slice(11, 16)}`)

  it("fills each range of that weekday back to back, in order", () => {
    // 09:00-11:30 → 09-10, 10-11 (11:00-12:00 doesn't fit); 13:00-15:00 → 13-14, 14-15. UTC = local - 7 h.
    expect(iso(candidateSlots("2026-11-09", PP, hours, 60))).toEqual([
      "02:00-03:00",
      "03:00-04:00",
      "06:00-07:00",
      "07:00-08:00",
    ])
  })

  it("uses the slot length given, and gives nothing on a closed day", () => {
    expect(iso(candidateSlots("2026-11-09", PP, hours, 90))).toEqual(["02:00-03:30", "06:00-07:30"])
    expect(candidateSlots("2026-11-08", PP, hours, 60)).toEqual([])
  })
})
