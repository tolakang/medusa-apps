"use client"

import { addToCart } from "@lib/data/cart"
import { removeFromWishlist, type WishlistItem } from "@lib/data/wishlist"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import { Button } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "@modules/products/components/thumbnail"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"

// Wishlist items with price, Add to cart and (for the owner) Remove
// (TASKS P1-19). Used by Account → Wishlist and the shared-link page.
export default function WishlistItems({
  items,
  products,
  canRemove,
}: {
  items: WishlistItem[]
  products: HttpTypes.StoreProduct[]
  canRemove: boolean
}) {
  const countryCode = useParams().countryCode as string
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const byId = new Map(products.map((product) => [product.id, product]))

  const add = async (variantId: string) => {
    setBusy(variantId)
    setMessage(null)
    try {
      await addToCart({ variantId, quantity: 1, countryCode })
      setMessage("Added to your cart.")
    } catch (error) {
      setMessage((error as Error).message)
    }
    setBusy(null)
  }

  const remove = async (itemId: string) => {
    setBusy(itemId)
    const result = await removeFromWishlist(itemId)
    setMessage(result.state === "error" ? result.error : null)
    setBusy(null)
    router.refresh()
  }

  if (!items.length) {
    return (
      <p className="text-base-regular" data-testid="wishlist-empty">
        Nothing saved yet. Use &quot;Save to wishlist&quot; on a product page.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-y-4" data-testid="wishlist-items">
      {message && <p className="text-small-regular">{message}</p>}
      {items.map((item) => {
        const product = byId.get(item.product_variant?.product_id ?? "")
        const variant = product?.variants?.find((v) => v.id === item.product_variant_id)
        const price = product ? getProductPrice({ product, variantId: item.product_variant_id }).variantPrice : null
        const title = item.product_variant?.product?.title ?? product?.title ?? "Product"
        const handle = item.product_variant?.product?.handle ?? product?.handle
        // A product that is no longer sold here is shown without a cart button.
        const available = !!variant
        return (
          <div
            key={item.id}
            className="flex gap-x-4 items-center border-b border-gray-200 pb-4"
            data-testid="wishlist-item"
          >
            <div className="w-20 shrink-0">
              <Thumbnail thumbnail={item.product_variant?.product?.thumbnail ?? product?.thumbnail} size="square" />
            </div>
            <div className="flex-1 flex flex-col text-small-regular">
              {handle ? (
                <LocalizedClientLink href={`/products/${handle}`} className="text-base-semi">
                  {title}
                </LocalizedClientLink>
              ) : (
                <span className="text-base-semi">{title}</span>
              )}
              {item.product_variant?.title && <span className="text-ui-fg-subtle">{item.product_variant.title}</span>}
              {price && <span>{price.calculated_price}</span>}
              {!available && <span className="text-ui-fg-subtle">No longer available</span>}
            </div>
            <div className="flex flex-col gap-y-2">
              <Button
                variant="secondary"
                className="min-h-[25px] py-1"
                onClick={() => add(item.product_variant_id)}
                disabled={!available}
                isLoading={busy === item.product_variant_id}
                data-testid="wishlist-add-to-cart"
              >
                Add to cart
              </Button>
              {canRemove && (
                <Button
                  variant="transparent"
                  className="min-h-[25px] py-1"
                  onClick={() => remove(item.id)}
                  isLoading={busy === item.id}
                  data-testid="wishlist-remove"
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
