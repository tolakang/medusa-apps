"use client"

import { resetPassword } from "@lib/data/customer"
import { MIN_PASSWORD_LENGTH } from "@lib/util/password"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useSearchParams } from "next/navigation"
import { useActionState } from "react"

// The page the password reset email links to (TASKS P1-18):
// /reset-password?token=…&email=… (docs "Reset Customer Password in Storefront").
const ResetPassword = () => {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const email = searchParams.get("email") ?? ""
  const [message, formAction] = useActionState(resetPassword, null)

  if (message?.state === "success") {
    return (
      <div className="max-w-sm w-full flex flex-col items-center" data-testid="reset-password-done">
        <h1 className="text-large-semi uppercase mb-6">Password changed</h1>
        <p className="text-center text-base-regular text-ui-fg-base">
          You can now sign in with your new password.
        </p>
        <LocalizedClientLink href="/account" className="underline mt-6">
          Sign in
        </LocalizedClientLink>
      </div>
    )
  }

  if (!token || !email) {
    return (
      <div className="max-w-sm w-full flex flex-col items-center" data-testid="reset-password-invalid">
        <h1 className="text-large-semi uppercase mb-6">Link incomplete</h1>
        <p className="text-center text-base-regular text-ui-fg-base">
          Open the link from the email again, or request a new one.
        </p>
        <LocalizedClientLink href="/forgot-password" className="underline mt-6">
          Request a new link
        </LocalizedClientLink>
      </div>
    )
  }

  return (
    <div className="max-w-sm w-full flex flex-col items-center" data-testid="reset-password-page">
      <h1 className="text-large-semi uppercase mb-6">Choose a new password</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        For <strong>{email}</strong>. Use at least {MIN_PASSWORD_LENGTH} characters.
      </p>
      <form className="w-full" action={formAction}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={email} />
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            data-testid="reset-password-input"
          />
          <Input
            label="Confirm new password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            data-testid="reset-password-confirm-input"
          />
        </div>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="reset-password-error"
        />
        <SubmitButton className="w-full mt-6" data-testid="reset-password-submit">
          Save new password
        </SubmitButton>
      </form>
      {message?.state === "error" && (
        <LocalizedClientLink href="/forgot-password" className="underline text-small-regular mt-6">
          Request a new link
        </LocalizedClientLink>
      )}
    </div>
  )
}

export default ResetPassword
