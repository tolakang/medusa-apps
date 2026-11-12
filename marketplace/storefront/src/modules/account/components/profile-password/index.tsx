"use client"

import { changePassword, requestOwnPasswordReset } from "@lib/data/customer"
import { MIN_PASSWORD_LENGTH } from "@lib/util/password"
import Input from "@modules/common/components/input"
import { useActionState, useEffect, useState } from "react"
import AccountInfo from "../account-info"

// Account → Profile → Password (owner, 2026-10-06): change it with the
// current password; if that is forgotten, get the emailed reset link
// (TASKS P1-18). Replaces the starter's unfinished form.
const ProfilePassword = () => {
  const [state, formAction] = useActionState(changePassword, { success: false, error: null })
  const [successState, setSuccessState] = useState(false)
  const [linkState, setLinkState] = useState<"idle" | "sending" | "sent" | "error">("idle")

  useEffect(() => {
    setSuccessState(state.success)
  }, [state])

  const sendLink = async () => {
    setLinkState("sending")
    const result = await requestOwnPasswordReset()
    setLinkState(result?.state === "success" ? "sent" : "error")
  }

  return (
    <form action={formAction} className="w-full">
      <AccountInfo
        label="Password"
        currentInfo={<span>The password is not shown for security reasons</span>}
        isSuccess={successState}
        isError={!!state.error}
        errorMessage={state.error ?? undefined}
        clearState={() => setSuccessState(false)}
        data-testid="account-password-editor"
      >
        <div className="grid grid-cols-1 small:grid-cols-3 gap-4">
          <Input
            label="Current password"
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="current-password-input"
          />
          <Input
            label="New password"
            name="new_password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            data-testid="new-password-input"
          />
          <Input
            label="Confirm new password"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            data-testid="confirm-password-input"
          />
        </div>
        <p className="text-small-regular text-ui-fg-subtle">
          Forgot your current password?{" "}
          {linkState === "sent" ? (
            <span data-testid="password-reset-sent">
              We emailed you a link to choose a new one (valid 15 minutes).
            </span>
          ) : (
            <button
              type="button"
              className="underline"
              onClick={sendLink}
              disabled={linkState === "sending"}
              data-testid="password-reset-button"
            >
              Email me a reset link
            </button>
          )}
          {linkState === "error" && <span className="text-rose-500"> Please try again.</span>}
        </p>
      </AccountInfo>
    </form>
  )
}

export default ProfilePassword
