import { Metadata } from "next"

import ForgotPassword from "@modules/account/components/forgot-password"

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Get a link to choose a new password.",
}

export default function ForgotPasswordPage() {
  return (
    <div className="w-full flex justify-center px-8 py-12">
      <ForgotPassword />
    </div>
  )
}
