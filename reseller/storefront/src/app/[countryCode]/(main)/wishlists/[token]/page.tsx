import { Metadata } from "next"

import { retrieveSharedWishlist, wishlistProducts } from "@lib/data/wishlist"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import WishlistItems from "@modules/wishlist/components/wishlist-items"

export const metadata: Metadata = {
  title: "Shared wishlist",
  description: "A wishlist someone shared with you.",
  robots: { index: false },
}

// A wishlist shared by link (TASKS P1-19). Anyone with the link can view it
// and add its products to their own cart; it never shows who saved it.
export default async function SharedWishlistPage(props: {
  params: Promise<{ countryCode: string; token: string }>
}) {
  const { countryCode, token } = await props.params
  const wishlist = await retrieveSharedWishlist(token)
  const products = await wishlistProducts(wishlist, countryCode)

  return (
    <div className="content-container py-12 max-w-3xl" data-testid="shared-wishlist-page">
      <h1 className="text-2xl-semi mb-6">Shared wishlist</h1>
      {wishlist ? (
        <WishlistItems items={wishlist.items} products={products} canRemove={false} />
      ) : (
        <div className="flex flex-col gap-y-4 text-base-regular" data-testid="shared-wishlist-invalid">
          <p>This wishlist link is invalid or has expired. Ask for a new link.</p>
          <LocalizedClientLink href="/store" className="underline">
            Browse the store
          </LocalizedClientLink>
        </div>
      )}
    </div>
  )
}
