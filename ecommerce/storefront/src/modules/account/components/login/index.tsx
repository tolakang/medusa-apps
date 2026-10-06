import { login } from "@lib/data/customer"
import CompleteProfile from "@modules/account/components/complete-profile"
import VerifyEmailNotice from "@modules/account/components/verify-email-notice"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useActionState, useState } from "react"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const Login = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(login, null)
  // "Back to sign in" from the verification screen shows the form again.
  const [dismissed, setDismissed] = useState(false)
  const submit = (formData: FormData) => {
    setDismissed(false)
    formAction(formData)
  }

  if (message?.state === "verification_required" && !dismissed) {
    return (
      <VerifyEmailNotice
        title="Verify your email first"
        email={message.email}
        sent={message.sent}
        onBack={() => setDismissed(true)}
      />
    )
  }
  if (message?.state === "complete_profile") {
    return <CompleteProfile email={message.email} />
  }

  // The email stays filled in after an error or "Back to sign in".
  const email =
    message?.state === "error"
      ? message.values?.email
      : message?.state === "verification_required"
        ? message.email
        : undefined

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="login-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Welcome back</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        Sign in to access an enhanced shopping experience.
      </p>
      <form className="w-full" action={submit}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Email"
            name="email"
            type="email"
            title="Enter a valid email address."
            autoComplete="email"
            required
            defaultValue={email}
            data-testid="email-input"
          />
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="password-input"
          />
        </div>
        <LocalizedClientLink
          href="/forgot-password"
          className="block text-right text-small-regular underline mt-2"
          data-testid="forgot-password-link"
        >
          Forgot password?
        </LocalizedClientLink>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="login-error-message"
        />
        <SubmitButton data-testid="sign-in-button" className="w-full mt-6">
          Sign in
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        Not a member?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
          className="underline"
          data-testid="register-button"
        >
          Join us
        </button>
        .
      </span>
    </div>
  )
}

export default Login
