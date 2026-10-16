"use client"

import { addToWishlist } from "@lib/data/wishlist"
import { Button } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useEffect, useState } from "react"

// "Save to wishlist" on the product page (TASKS P1-19). Guests are sent to
// sign in; the wishlist is created on the first save.
export default function WishlistButton({ variantId }: { variantId?: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "sign_in" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  // Another variant selected: offer to save that one.
  useEffect(() => setState("idle"), [variantId])

  const save = async () => {
    if (!variantId) return
    setState("saving")
    const result = await addToWishlist(variantId)
    setState(result.state === "success" ? "saved" : result.state)
    setError(result.state === "error" ? result.error : null)
  }

  return (
    <div className="flex flex-col gap-y-1 text-small-regular" data-testid="wishlist-button-wrapper">
      <Button
        variant="secondary"
        className="w-full h-10"
        onClick={save}
        disabled={!variantId || state === "saved"}
        isLoading={state === "saving"}
        data-testid="wishlist-button"
      >
        {state === "saved" ? "♥ Saved to wishlist" : "♡ Save to wishlist"}
      </Button>
      {state === "saved" && (
        <LocalizedClientLink href="/account/wishlist" className="underline text-center">
          View wishlist
        </LocalizedClientLink>
      )}
      {state === "sign_in" && (
        <p className="text-center">
          <LocalizedClientLink href="/account" className="underline">
            Sign in
          </LocalizedClientLink>{" "}
          to save products to your wishlist.
        </p>
      )}
      {state === "error" && <p className="text-rose-500 text-center">{error}</p>}
    </div>
  )
}
