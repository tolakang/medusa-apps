"use client"

import { shareWishlist } from "@lib/data/wishlist"
import { Button } from "@modules/common/components/ui"
import { useParams } from "next/navigation"
import { useState } from "react"

// "Share wishlist" (TASKS P1-19): a link anyone can open for 30 days. It shows
// the products, not who saved them.
export default function ShareWishlist() {
  const countryCode = useParams().countryCode as string
  const [link, setLink] = useState<{ url: string; expires: string } | null>(null)
  const [state, setState] = useState<"idle" | "working" | "copied" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setState("working")
    const result = await shareWishlist()
    if (result.state === "success") {
      setLink({
        url: `${window.location.origin}/${countryCode}/wishlists/${result.token}`,
        expires: new Date(result.expires_at).toLocaleDateString(),
      })
      setState("idle")
    } else {
      setError(result.error)
      setState("error")
    }
  }

  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link.url).catch(() => undefined)
    setState("copied")
  }

  return (
    <div className="flex flex-col gap-y-2 text-small-regular" data-testid="share-wishlist">
      {link ? (
        <>
          <input
            readOnly
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full border border-ui-border-base rounded-rounded px-3 py-2"
            data-testid="share-wishlist-url"
          />
          <div className="flex items-center gap-x-3">
            <Button variant="secondary" className="min-h-[25px] py-1" onClick={copy}>
              {state === "copied" ? "Copied" : "Copy link"}
            </Button>
            <span className="text-ui-fg-subtle">Works until {link.expires}.</span>
          </div>
        </>
      ) : (
        <Button
          variant="secondary"
          className="w-fit min-h-[25px] py-1"
          onClick={create}
          isLoading={state === "working"}
          data-testid="share-wishlist-button"
        >
          Share wishlist
        </Button>
      )}
      {state === "error" && <p className="text-rose-500">{error}</p>}
    </div>
  )
}
