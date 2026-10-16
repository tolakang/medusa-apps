import { Metadata } from "next"

import { retrieveWishlist, wishlistProducts } from "@lib/data/wishlist"
import ShareWishlist from "@modules/wishlist/components/share-wishlist"
import WishlistItems from "@modules/wishlist/components/wishlist-items"

export const metadata: Metadata = {
  title: "Wishlist",
  description: "Products you saved for later.",
}

// Account → Wishlist (TASKS P1-19).
export default async function WishlistPage(props: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await props.params
  const wishlist = await retrieveWishlist()
  const products = await wishlistProducts(wishlist, countryCode)

  return (
    <div className="w-full" data-testid="wishlist-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Wishlist</h1>
        <p className="text-base-regular">
          Products you saved for later. Add them to your cart, remove them, or
          share the list with someone.
        </p>
      </div>
      <div className="flex flex-col gap-y-8">
        <WishlistItems items={wishlist?.items ?? []} products={products} canRemove />
        {!!wishlist?.items.length && <ShareWishlist />}
      </div>
    </div>
  )
}
