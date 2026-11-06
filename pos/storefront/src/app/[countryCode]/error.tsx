"use client"

import Link from "next/link"
import { useEffect } from "react"

// Friendly fallback when a page in the shop crashes (pre-deploy audit E-A2).
// The details stay in the server log; the shopper sees no stack or message.
export default function ShopError({
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
    <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)] px-8 text-center">
      <h1 className="text-2xl-semi text-ui-fg-base">Something went wrong</h1>
      <p className="text-small-regular text-ui-fg-base">
        Please try again. If it keeps happening, come back in a few minutes.
      </p>
      <div className="flex gap-x-6">
        <button type="button" className="text-ui-fg-interactive" onClick={() => reset()}>
          Try again
        </button>
        <Link className="text-ui-fg-interactive" href="/">
          Go to frontpage
        </Link>
      </div>
    </div>
  )
}
