"use client"

import "./globals.css"

// Last-resort page when the root layout itself fails (REVIEW_FIXES C5). It
// replaces the root layout, so it renders its own <html> and <body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <main className="flex min-h-screen items-center justify-center p-6">
          <div className="card w-full max-w-sm p-6 text-center">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm">Please try again in a moment.</p>
            <button className="btn-primary mt-4" type="button" onClick={() => reset()}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
