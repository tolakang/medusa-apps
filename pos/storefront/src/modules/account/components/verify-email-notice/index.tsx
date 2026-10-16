"use client"

import { resendVerificationEmail, type VerificationSent } from "@lib/data/customer"
import { Button } from "@modules/common/components/ui"
import { useState } from "react"

// Shown instead of the form when an account's email isn't verified yet
// (after sign-up, or when signing in before verifying). Says what happened
// and what to do; the backend sends at most one email per 2 minutes.
const TEXT: Record<VerificationSent, (email: string) => React.ReactNode> = {
  sent: (email) => (
    <>
      We sent a verification link to <strong>{email}</strong>. Open it to
      activate your account, then sign in. Can&apos;t find it? Check your spam
      folder.
    </>
  ),
  recent: (email) => (
    <>
      We already sent a verification link to <strong>{email}</strong> a moment
      ago. Open it to activate your account, then sign in. Can&apos;t find it?
      Check your spam folder.
    </>
  ),
  failed: (email) => (
    <>
      We couldn&apos;t send the verification email to <strong>{email}</strong>{" "}
      right now. Please try again in a few minutes.
    </>
  ),
}

export default function VerifyEmailNotice({
  title,
  email,
  sent,
  onBack,
}: {
  title: string
  email: string
  sent: VerificationSent
  onBack: () => void
}) {
  const [current, setCurrent] = useState<VerificationSent>(sent)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  const resend = async () => {
    setResending(true)
    const result = await resendVerificationEmail()
    setCurrent(result)
    setResent(result === "sent")
    setResending(false)
  }

  return (
    <div className="max-w-sm w-full flex flex-col items-center" data-testid="verify-email-notice">
      <h1 className="text-large-semi uppercase mb-6 text-center">{title}</h1>
      <p
        className="text-center text-base-regular text-ui-fg-base mb-8"
        data-testid="verify-email-message"
      >
        {resent ? "We sent a new link. " : ""}
        {TEXT[current](email)}
      </p>
      <Button className="w-full" size="large" onClick={onBack} data-testid="verify-email-sign-in">
        Back to sign in
      </Button>
      <Button
        variant="transparent"
        className="w-full mt-2"
        onClick={resend}
        isLoading={resending}
        data-testid="verify-email-resend"
      >
        Resend link
      </Button>
    </div>
  )
}
