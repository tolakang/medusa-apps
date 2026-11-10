"use client"

import { completeProfile } from "@lib/data/customer"
import { phoneInputProps } from "@lib/util/phone"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { useActionState } from "react"

// First sign-in of a verified account whose sign-up details aren't on this
// device (verified on another device, or a day later): ask for them once
// instead of creating a nameless account (owner, 2026-10-06).
export default function CompleteProfile({ email }: { email: string }) {
  const [state, formAction] = useActionState(completeProfile, null)
  const values = state?.state === "error" ? state.values : undefined

  return (
    <div className="max-w-sm w-full flex flex-col items-center" data-testid="complete-profile">
      <h1 className="text-large-semi uppercase mb-6">Complete your profile</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        Your email <strong>{email}</strong> is verified. Tell us your name and
        phone number to finish setting up your account.
      </p>
      <form className="w-full" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="First name"
            name="first_name"
            required
            autoComplete="given-name"
            defaultValue={values?.first_name}
            data-testid="complete-first-name"
          />
          <Input
            label="Last name"
            name="last_name"
            required
            autoComplete="family-name"
            defaultValue={values?.last_name}
            data-testid="complete-last-name"
          />
          <Input
            label="Phone"
            name="phone"
            defaultValue={values?.phone}
            {...phoneInputProps}
            data-testid="complete-phone"
          />
        </div>
        <ErrorMessage
          error={state?.state === "error" ? state.error : null}
          data-testid="complete-profile-error"
        />
        <SubmitButton className="w-full mt-6" data-testid="complete-profile-submit">
          Save and continue
        </SubmitButton>
      </form>
    </div>
  )
}
