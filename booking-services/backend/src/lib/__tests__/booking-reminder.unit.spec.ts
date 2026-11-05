import { bookingReminderEmail, formatBookingTime } from "../booking-reminder"
import { renderEmail } from "../../modules/resend/templates"

// TASKS P3-09: the reminder email.
const data = {
  booking: {
    id: "book_1",
    starts_at: "2026-11-10T03:00:00.000Z",
    ends_at: "2026-11-10T04:00:00.000Z",
    timezone: "Asia/Phnom_Penh",
    resource_name: "Sophea <Senior>",
    customer_name: "Sok Dara",
  },
}

describe("booking reminder email", () => {
  it("shows the time in the resource's time zone", () => {
    expect(formatBookingTime(data.booking.starts_at, data.booking.ends_at, "Asia/Phnom_Penh")).toEqual(
      "Tuesday 10 November 2026, 10:00–11:00"
    )
  })

  it("has a subject with the resource and time, and escapes names", () => {
    const email = bookingReminderEmail(data)
    expect(email.subject).toEqual("Reminder: Sophea <Senior>, Tuesday 10 November 2026, 10:00–11:00")
    expect(email.html).toContain("Hello Sok Dara,")
    expect(email.html).toContain("Sophea &lt;Senior&gt;")
    expect(email.html).not.toContain("<Senior>")
    expect(email.html).toContain("Asia/Phnom_Penh")
  })

  it("is rendered by the Resend provider for the booking-reminder template", () => {
    expect(renderEmail("booking-reminder", data)?.subject).toMatch(/^Reminder: /)
    expect(renderEmail("booking-reminder", {})).toBeNull()
  })
})
