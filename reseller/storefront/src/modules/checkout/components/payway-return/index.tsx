"use client"

import { placeOrder } from "@lib/data/cart"
import { Button, Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useEffect, useRef, useState } from "react"

// Back from ABA PayWay (TASKS P1-03). Places the order: the backend asks
// PayWay whether this cart's payment went through and, if so, creates the
// order and we go to the confirmation page (placeOrder redirects). PayWay may
// take a few seconds to confirm, so this retries for about a minute. PayWay's
// callback also creates the order on the backend, so nothing is lost if the
// customer closes this page.
const ATTEMPTS = 20
const DELAY_MS = 3000

export default function PaywayReturn() {
  const [waiting, setWaiting] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const started = useRef(false)

  const tryPlaceOrder = async () => {
    setWaiting(true)
    setMessage(null)
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        // Placed: placeOrder redirects to the confirmation page. Not paid
        // yet: Medusa answers with the cart (type "cart") and it comes back
        // here, so wait and ask again.
        const cart = await placeOrder()
        if (!cart) return
      } catch (err) {
        // A redirect is how Next.js navigates after the order is placed.
        if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err
        if (attempt === ATTEMPTS) {
          setMessage(err instanceof Error ? err.message : String(err))
        }
      }
      if (attempt < ATTEMPTS) {
        await new Promise((r) => setTimeout(r, DELAY_MS))
      }
    }
    setWaiting(false)
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    tryPlaceOrder()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="content-container py-24 flex flex-col gap-y-4 max-w-xl">
      <Heading level="h1" className="text-2xl">
        {waiting
          ? "Confirming your payment…"
          : "We could not confirm your payment yet"}
      </Heading>
      {waiting ? (
        <Text className="text-ui-fg-subtle">
          Please keep this page open. We are checking your payment with ABA
          PayWay and will show your order in a moment.
        </Text>
      ) : (
        <>
          <Text className="text-ui-fg-subtle">
            If you paid, your order will still be created as soon as ABA PayWay
            confirms it, and we will contact you. If you did not finish paying,
            go back to checkout and try again.
          </Text>
          {message && (
            <Text
              className="text-ui-fg-muted txt-small"
              data-testid="payway-return-error"
            >
              {message}
            </Text>
          )}
          <div className="flex gap-x-3">
            <Button onClick={tryPlaceOrder} data-testid="payway-retry-button">
              Check again
            </Button>
            <LocalizedClientLink href="/checkout?step=review">
              <Button variant="secondary">Back to checkout</Button>
            </LocalizedClientLink>
          </div>
        </>
      )}
    </div>
  )
}
