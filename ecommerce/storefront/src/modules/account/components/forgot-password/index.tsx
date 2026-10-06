"use client"

import { requestPasswordReset } from "@lib/data/customer"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useActionState } from "react"

// "Forgot password?" (TASKS P1-18). The answer is the same whether or not the
// email has an account, so nobody can use this page to find registered emails.
const ForgotPassword = () => {
  const [message, formAction] = useActionState(requestPasswordReset, null)

  return (
    <div className="max-w-sm w-full flex flex-col items-center" data-testid="forgot-password-page">
      <h1 className="text-large-semi uppercase mb-6">Forgot your password?</h1>
      {message?.state === "success" ? (
        <p className="text-center text-base-regular text-ui-fg-base" data-testid="forgot-password-sent">
          If an account exists for that email, we sent a link to choose a new
          password. It works once and expires in 15 minutes. Check your spam
          folder too.
        </p>
      ) : (
        <>
          <p className="text-center text-base-regular text-ui-fg-base mb-8">
            Enter the email of your account and we&apos;ll send you a link to
            choose a new password.
          </p>
          <form className="w-full" action={formAction}>
            <Input
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              required
              data-testid="forgot-password-email-input"
            />
            <ErrorMessage
              error={message?.state === "error" ? message.error : null}
              data-testid="forgot-password-error"
            />
            <SubmitButton className="w-full mt-6" data-testid="forgot-password-submit">
              Send link
            </SubmitButton>
          </form>
        </>
      )}
      <LocalizedClientLink href="/account" className="underline text-small-regular mt-6">
        Back to sign in
      </LocalizedClientLink>
    </div>
  )
}

export default ForgotPassword
