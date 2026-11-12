import { Suspense } from "react"
import VerifyAccount from "./verify-account"

// The link in the "confirm your email" message (review 2, A3).
export default function VerifyAccountPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <h1 className="text-2xl font-semibold">Confirm your email</h1>
        <Suspense fallback={<p className="mt-4 text-ui-fg-subtle">Confirming your email…</p>}>
          <VerifyAccount />
        </Suspense>
      </div>
    </main>
  )
}
