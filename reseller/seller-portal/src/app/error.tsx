"use client"

import { useEffect } from "react"

// A short "something went wrong" page instead of Next's bare error screen
// (REVIEW_FIXES C5, as the storefronts' E-A2). The details stay in the server
// log; the user sees no stack or message.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Page error", error.digest ?? "")
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-sm p-6 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-ui-fg-subtle">
          The shop server didn&apos;t answer. Please try again in a moment.
        </p>
        <button className="btn-primary mt-4" type="button" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  )
}
