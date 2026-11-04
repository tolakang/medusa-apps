"use client"

import { setServiceContact } from "@lib/data/booking"
import { HttpTypes } from "@medusajs/types"
import { Heading, Input, Label, Text, clx } from "@modules/common/components/ui"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import ErrorMessage from "@modules/checkout/components/error-message"
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation"
import { useActionState } from "react"

// Checkout step for a cart of booked services only (TASKS P3-13): there is
// nothing to deliver, so instead of address and delivery the customer gives
// a name, an email (confirmation and the 24-hour reminder) and a phone. Uses
// the "address" step slot of the checkout.
export default function ServiceContact({ cart }: { cart: HttpTypes.StoreCart }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const countryCode = useParams().countryCode as string
  const isOpen = searchParams.get("step") === "address"
  const [message, formAction] = useActionState(setServiceContact, null)
  const address = cart.shipping_address

  return (
    <div className="bg-white">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading level="h2" className="flex flex-row text-3xl-regular gap-x-2 items-baseline">
          Your details
        </Heading>
        {!isOpen && cart.email && (
          <Text>
            <button onClick={() => router.push(pathname + "?step=address")} className="text-ui-fg-interactive" data-testid="edit-contact-button">
              Edit
            </button>
          </Text>
        )}
      </div>
      {isOpen ? (
        <form action={formAction} className="grid grid-cols-1 small:grid-cols-2 gap-4" data-testid="service-contact-form">
          <input type="hidden" name="country_code" value={countryCode} />
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="first_name">First name</Label>
            <Input id="first_name" name="first_name" defaultValue={address?.first_name ?? ""} autoComplete="given-name" />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="last_name">Last name</Label>
            <Input id="last_name" name="last_name" defaultValue={address?.last_name ?? ""} autoComplete="family-name" />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required defaultValue={cart.email ?? ""} autoComplete="email" />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input id="phone" name="phone" type="tel" defaultValue={address?.phone ?? ""} autoComplete="tel" />
          </div>
          <div className="small:col-span-2 flex flex-col gap-y-2">
            <Text className="txt-small text-ui-fg-subtle">
              No delivery: you come to us at the booked time. We email your confirmation and a reminder the day before.
            </Text>
            <SubmitButton className="mt-2" data-testid="submit-contact-button">
              Continue to payment
            </SubmitButton>
            <ErrorMessage error={message} data-testid="contact-error-message" />
          </div>
        </form>
      ) : (
        <div className={clx("txt-medium text-ui-fg-subtle", { hidden: !cart.email })}>
          <Text className="txt-medium-plus text-ui-fg-base">
            {[address?.first_name, address?.last_name].filter(Boolean).join(" ") || "Contact"}
          </Text>
          <Text>{cart.email}</Text>
          {address?.phone && <Text>{address.phone}</Text>}
        </div>
      )}
    </div>
  )
}
