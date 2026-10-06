"use client"

import { startTransition, useActionState } from "react"
import { useCaptcha } from "@modules/common/components/captcha"
import Input from "@modules/common/components/input"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { signup } from "@lib/data/customer"
import { phoneInputProps } from "@lib/util/phone"
import CompleteProfile from "@modules/account/components/complete-profile"
import VerifyEmailNotice from "@modules/account/components/verify-email-notice"
import { MIN_PASSWORD_LENGTH } from "@lib/util/password"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const Register = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(signup, null)
  const captcha = useCaptcha("signup")
  const submit = async (formData: FormData) => {
    formData.set("captcha_token", await captcha.getToken().catch(() => ""))
    startTransition(() => formAction(formData))
  }

  // Account created: only the next step is shown (owner, 2026-10-06).
  if (message?.state === "verification_required") {
    return (
      <VerifyEmailNotice
        title="Check your email"
        email={message.email}
        sent={message.sent}
        onBack={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
      />
    )
  }
  if (message?.state === "complete_profile") {
    return <CompleteProfile email={message.email} />
  }

  // The typed values stay after an error (React resets the form fields).
  const values =
    message?.state === "error" || message?.state === "exists" ? message.values : undefined

  return (
    <div
      className="max-w-sm flex flex-col items-center"
      data-testid="register-page"
    >
      <h1 className="text-large-semi uppercase mb-6">
        Become a Medusa Store Member
      </h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-4">
        Create your Medusa Store Member profile, and get access to an enhanced
        shopping experience.
      </p>
      <form className="w-full flex flex-col" action={submit}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="First name"
            name="first_name"
            required
            defaultValue={values?.first_name}
            autoComplete="given-name"
            data-testid="first-name-input"
          />
          <Input
            label="Last name"
            name="last_name"
            required
            defaultValue={values?.last_name}
            autoComplete="family-name"
            data-testid="last-name-input"
          />
          <Input
            label="Email"
            name="email"
            required
            type="email"
            autoComplete="email"
            defaultValue={values?.email}
            data-testid="email-input"
          />
          <Input
            label="Phone"
            name="phone"
            defaultValue={values?.phone}
            {...phoneInputProps}
            data-testid="phone-input"
          />
          <Input
            label={`Password (at least ${MIN_PASSWORD_LENGTH} characters)`}
            name="password"
            required
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            data-testid="password-input"
          />
        </div>
        {message?.state === "exists" && (
          <div
            className="w-full mt-4 text-small-regular text-ui-fg-base bg-ui-bg-subtle border border-ui-border-base rounded-rounded p-3"
            data-testid="register-exists"
          >
            An account with <strong>{message.email}</strong> already exists.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
            >
              Sign in
            </button>{" "}
            or{" "}
            <LocalizedClientLink href="/forgot-password" className="underline">
              reset your password
            </LocalizedClientLink>
            .
          </div>
        )}
        {captcha.widget}
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="register-error"
        />
        <span className="text-center text-ui-fg-base text-small-regular mt-6">
          By creating an account, you agree to Medusa Store&apos;s{" "}
          <LocalizedClientLink
            href="/content/privacy-policy"
            className="underline"
          >
            Privacy Policy
          </LocalizedClientLink>{" "}
          and{" "}
          <LocalizedClientLink
            href="/content/terms-of-use"
            className="underline"
          >
            Terms of Use
          </LocalizedClientLink>
          .
        </span>
        <SubmitButton className="w-full mt-6" data-testid="register-button">
          Join
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        Already a member?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="underline"
        >
          Sign in
        </button>
        .
      </span>
    </div>
  )
}

export default Register
