"use client"

import { requestOwnPasswordReset } from "@lib/data/customer"
import { Button } from "@modules/common/components/ui"
import { useState } from "react"

// Account → Profile → Password (TASKS P1-18). Medusa's store API has no route
// that changes a password with the old one, so a signed-in customer gets the
// same emailed link as "Forgot password?" (docs "Reset Customer Password in
// Storefront"). Replaces the starter's unfinished form.
const ProfilePassword = () => {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    setState("sending")
    const result = await requestOwnPasswordReset()
    if (result?.state === "success") {
      setState("sent")
    } else {
      setState("error")
      setError(result?.state === "error" ? result.error : "Please try again.")
    }
  }

  return (
    <div className="text-small-regular" data-testid="account-password-editor">
      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <span className="uppercase text-ui-fg-base">Password</span>
          <span className="text-ui-fg-subtle mt-2">
            {state === "sent"
              ? "We emailed you a link to choose a new password. It expires in 15 minutes."
              : "To change it, we email you a link to choose a new one."}
          </span>
          {state === "error" && (
            <span className="text-rose-500 mt-2" data-testid="password-reset-error">
              {error}
            </span>
          )}
        </div>
        <Button
          variant="secondary"
          className="w-[100px] min-h-[25px] py-1"
          onClick={send}
          isLoading={state === "sending"}
          disabled={state === "sent"}
          data-testid="password-reset-button"
        >
          {state === "sent" ? "Sent" : "Send link"}
        </Button>
      </div>
    </div>
  )
}

export default ProfilePassword
