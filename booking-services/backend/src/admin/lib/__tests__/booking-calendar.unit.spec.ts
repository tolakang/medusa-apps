import {
  customerLabel,
  groupByLocalDay,
  shiftDate,
  timeRange,
  todayIn,
  viewWindow,
  walkInTimes,
  weekDays,
} from "../booking-calendar"

// TASKS P3-11: the admin Bookings page's date logic.
const PP = "Asia/Phnom_Penh"

describe("booking calendar", () => {
  it("builds a Monday-first week and moves by a day or a week", () => {
    // 2026-11-11 is a Wednesday.
    expect(weekDays("2026-11-11")).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ])
    expect(weekDays("2026-11-15")[0]).toEqual("2026-11-09") // Sunday belongs to that week
    expect(shiftDate("2026-11-11", "day", 1)).toEqual("2026-11-12")
    expect(shiftDate("2026-11-11", "week", -1)).toEqual("2026-11-04")
    expect(shiftDate("2026-12-31", "day", 1)).toEqual("2027-01-01")
  })

  it("asks the API for local midnight to midnight in the resource's zone", () => {
    expect(viewWindow("2026-11-11", "day", PP)).toEqual({
      from: "2026-11-10T17:00:00.000Z",
      to: "2026-11-11T17:00:00.000Z",
    })
    expect(viewWindow("2026-11-11", "week", PP)).toEqual({
      from: "2026-11-08T17:00:00.000Z",
      to: "2026-11-15T17:00:00.000Z",
    })
  })

  it("groups bookings by their local day and shows local times", () => {
    const early = { id: "b1", status: "confirmed", starts_at: "2026-11-10T23:30:00.000Z", ends_at: "2026-11-11T00:30:00.000Z" }
    const late = { id: "b2", status: "pending", starts_at: "2026-11-11T02:00:00.000Z", ends_at: "2026-11-11T03:00:00.000Z" }
    const grouped = groupByLocalDay([late, early], ["2026-11-10", "2026-11-11"], PP)
    // 23:30 UTC on the 10th is 06:30 on the 11th in Phnom Penh.
    expect(grouped["2026-11-10"]).toEqual([])
    expect(grouped["2026-11-11"].map((b) => b.id)).toEqual(["b1", "b2"])
    expect(timeRange(early, PP)).toEqual("06:30–07:30")
  })

  it("names the customer, or Walk-in", () => {
    const base = { id: "b", status: "confirmed", starts_at: "", ends_at: "" }
    expect(customerLabel({ ...base, customer: { first_name: "Sok", last_name: "Dara", email: "s@x.com" } })).toEqual("Sok Dara")
    expect(customerLabel({ ...base, customer: { first_name: null, last_name: null, email: "s@x.com" } })).toEqual("s@x.com")
    expect(customerLabel(base)).toEqual("Walk-in")
  })

  it("turns the walk-in form's local time into UTC instants", () => {
    expect(walkInTimes("2026-11-11", "14:30", 45, PP)).toEqual({
      starts_at: "2026-11-11T07:30:00.000Z",
      ends_at: "2026-11-11T08:15:00.000Z",
    })
    expect(todayIn(PP, new Date("2026-11-10T18:00:00Z"))).toEqual("2026-11-11")
  })
})
