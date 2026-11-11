"use client"

import "@/styles/globals.css"

// Last-resort page when the root layout itself fails (pre-deploy audit E-A2).
// It replaces the root layout, so it renders its own <html> and <body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" data-mode="light">
      <body>
        <div className="flex flex-col gap-4 items-center justify-center min-h-screen px-8 text-center">
          <h1 className="text-2xl font-semibold text-neutral-950">Something went wrong</h1>
          <p className="text-sm text-neutral-700">
            Please try again in a few minutes.
          </p>
          <button type="button" className="text-ui-fg-interactive" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
