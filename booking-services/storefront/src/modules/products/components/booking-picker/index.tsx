"use client"

import { addBookingToCart, listSlots, type Slot } from "@lib/data/booking"
import { durationMinutes, formatSlotTime, localDate } from "@lib/util/booking"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { Button, Text, clx } from "@modules/common/components/ui"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"

// Book a service (TASKS P3-13): pick the length (a variant), a day and a free
// time, then the slot is held and added to the cart (POST /store/booking/cart,
// hold for BOOKING_HOLD_MINUTES). Times are the resource's local time.
export default function BookingPicker({ product }: { product: HttpTypes.StoreProduct }) {
  const router = useRouter()
  const countryCode = useParams().countryCode as string
  const services = useMemo(
    () => (product.variants ?? []).filter((v) => durationMinutes(v) !== null),
    [product.variants]
  )
  const [variantId, setVariantId] = useState(services[0]?.id ?? "")
  const [date, setDate] = useState(() => localDate(null))
  const [slots, setSlots] = useState<Slot[]>([])
  const [chosen, setChosen] = useState<Slot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()
  const [booking, startBooking] = useTransition()

  useEffect(() => {
    if (!variantId || !date) {
      return
    }
    setChosen(null)
    setError(null)
    startLoading(async () => {
      const result = await listSlots(variantId, date)
      setSlots(result.slots)
      setError(result.error ?? null)
    })
  }, [variantId, date])

  const book = () => {
    if (!chosen) {
      return
    }
    startBooking(async () => {
      const result = await addBookingToCart({ countryCode, variantId, slot: chosen })
      if (result.error) {
        setError(result.error)
        // Someone else may have taken it: refresh the times.
        const fresh = await listSlots(variantId, date)
        setSlots(fresh.slots)
        setChosen(null)
        return
      }
      router.push(`/${countryCode}/cart`)
    })
  }

  const price = (v: HttpTypes.StoreProductVariant) =>
    v.calculated_price?.calculated_amount != null
      ? convertToLocale({ amount: v.calculated_price.calculated_amount, currency_code: v.calculated_price.currency_code ?? "usd" })
      : ""

  return (
    <div className="flex flex-col gap-y-4" data-testid="booking-picker">
      {services.length > 1 && (
        <div className="flex flex-col gap-y-2">
          <Text className="txt-compact-small-plus">Length</Text>
          <div className="flex flex-wrap gap-2">
            {services.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                className={clx("border rounded-md px-3 py-2 txt-small", {
                  "border-ui-border-interactive bg-ui-bg-subtle": v.id === variantId,
                  "border-ui-border-base": v.id !== variantId,
                })}
                data-testid="booking-length"
              >
                {v.title} {price(v) && <span className="text-ui-fg-subtle">· {price(v)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-y-2">
        <Text className="txt-compact-small-plus">Day</Text>
        <input
          type="date"
          value={date}
          min={localDate(null)}
          onChange={(e) => setDate(e.target.value)}
          className="border border-ui-border-base rounded-md px-3 py-2 txt-small"
          data-testid="booking-date"
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <Text className="txt-compact-small-plus">Time</Text>
        {loading && <Text className="txt-small text-ui-fg-subtle">Loading times…</Text>}
        {!loading && slots.length === 0 && (
          <Text className="txt-small text-ui-fg-subtle">No free times on this day. Try another day.</Text>
        )}
        <div className="grid grid-cols-3 gap-2">
          {slots.map((s) => (
            <button
              key={`${s.resource_id}-${s.starts_at}`}
              type="button"
              onClick={() => setChosen(s)}
              className={clx("border rounded-md px-2 py-2 txt-small text-left", {
                "border-ui-border-interactive bg-ui-bg-subtle": chosen === s,
                "border-ui-border-base": chosen !== s,
              })}
              data-testid="booking-slot"
            >
              <span className="block txt-small-plus">{formatSlotTime(s.starts_at, s.timezone)}</span>
              {s.resource_name && <span className="block text-ui-fg-subtle txt-xsmall">{s.resource_name}</span>}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <Text className="txt-small text-ui-fg-error" data-testid="booking-error">
          {error}
        </Text>
      )}
      <Button onClick={book} disabled={!chosen || booking} isLoading={booking} className="w-full h-10" data-testid="booking-submit">
        {chosen ? `Book ${formatSlotTime(chosen.starts_at, chosen.timezone)}` : "Choose a time"}
      </Button>
      <Text className="txt-xsmall text-ui-fg-subtle">The time is held for you while you check out.</Text>
    </div>
  )
}
