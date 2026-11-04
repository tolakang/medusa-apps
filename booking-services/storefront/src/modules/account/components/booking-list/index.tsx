"use client"

import { cancelMyBooking, type MyBooking } from "@lib/data/booking"
import { formatBookingRange } from "@lib/util/booking"
import { Badge, Button, Heading, Text } from "@modules/common/components/ui"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

const REFUND_TEXT: Record<string, string> = {
  refunded: "Cancelled and refunded.",
  outside_policy: "Cancelled. It was too close to the start for a refund.",
  not_captured: "Cancelled. Your payment wasn't taken yet, so nothing is charged.",
  no_order: "Cancelled.",
}

// A list of the customer's bookings (TASKS P3-13).
export default function BookingList({
  title,
  bookings,
  empty,
  canCancel = false,
}: {
  title: string
  bookings: MyBooking[]
  empty: string
  canCancel?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Two-step cancel in the page (no browser dialog): Cancel → Yes, cancel.
  const [confirming, setConfirming] = useState<string | null>(null)

  const cancel = (id: string) => {
    setConfirming(null)
    setBusy(id)
    start(async () => {
      const result = await cancelMyBooking(id)
      setNotice(result.error ?? REFUND_TEXT[result.refund ?? ""] ?? "Cancelled.")
      setBusy(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-y-3" data-testid={`bookings-${title.toLowerCase().split(" ")[0]}`}>
      <Heading level="h2" className="text-large-semi">
        {title}
      </Heading>
      {notice && (
        <Text className="txt-small text-ui-fg-subtle" data-testid="booking-notice">
          {notice}
        </Text>
      )}
      {bookings.length === 0 && empty && <Text className="txt-small text-ui-fg-subtle">{empty}</Text>}
      {bookings.map((b) => (
        <div
          key={b.id}
          className="flex flex-wrap items-center justify-between gap-3 border border-ui-border-base rounded-md p-4"
          data-testid="booking-row"
        >
          <div className="flex flex-col gap-y-1">
            <Text className="txt-medium-plus">{formatBookingRange(b.starts_at, b.ends_at, b.resource?.timezone)}</Text>
            <Text className="txt-small text-ui-fg-subtle">
              {b.resource?.name ?? ""}
              {b.order?.display_id != null ? ` · Order #${b.order.display_id}` : ""}
            </Text>
          </div>
          <div className="flex items-center gap-3">
            <Badge>{b.status === "pending" ? "held" : b.status.replace("_", " ")}</Badge>
            {canCancel && confirming !== b.id && (
              <Button
                variant="secondary"
                isLoading={pending && busy === b.id}
                onClick={() => setConfirming(b.id)}
                data-testid="booking-cancel"
              >
                Cancel
              </Button>
            )}
            {canCancel && confirming === b.id && (
              <>
                <Button variant="secondary" onClick={() => setConfirming(null)} data-testid="booking-keep">
                  Keep it
                </Button>
                <Button onClick={() => cancel(b.id)} data-testid="booking-cancel-confirm">
                  Yes, cancel
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
