import { Metadata } from "next"

import { listMyBookings } from "@lib/data/booking"
import BookingList from "@modules/account/components/booking-list"

export const metadata: Metadata = {
  title: "Bookings",
  description: "Your booked times.",
}

// Account → Bookings (TASKS P3-13): the customer's bookings, upcoming first,
// with cancel (the shop's cancellation policy decides any refund, P3-08).
export default async function BookingsPage() {
  const bookings = (await listMyBookings()) ?? []
  const now = Date.now()
  const active = (s: string) => s === "confirmed" || s === "pending"
  const upcoming = bookings
    .filter((b) => active(b.status) && new Date(b.ends_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const past = bookings.filter((b) => !upcoming.includes(b))

  return (
    <div className="w-full" data-testid="bookings-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Bookings</h1>
        <p className="text-base-regular">
          Your booked times. Cancel a booking here if you can&apos;t come: cancelling early enough is refunded under
          the shop&apos;s cancellation policy.
        </p>
      </div>
      <div className="flex flex-col gap-y-8">
        <BookingList title="Upcoming" bookings={upcoming} canCancel empty="No upcoming bookings." />
        {past.length > 0 && <BookingList title="Past and cancelled" bookings={past} empty="" />}
      </div>
    </div>
  )
}
