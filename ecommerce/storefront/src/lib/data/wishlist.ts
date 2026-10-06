"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"
import { revalidatePath } from "next/cache"
import { getAuthHeaders } from "./cookies"
import { listProducts } from "./products"

// Wishlist (TASKS P1-19): the backend's /store/customers/me/wishlists routes
// (signed-in customer) and /store/wishlists/:token (shared link, anyone).

export type WishlistItem = {
  id: string
  product_variant_id: string
  product_variant?: {
    id: string
    title: string | null
    product_id: string
    product?: { id: string; title: string; handle: string; thumbnail: string | null } | null
  } | null
}
export type Wishlist = { id: string; items: WishlistItem[] }

export type WishlistActionResult =
  | { state: "success" }
  | { state: "sign_in" }
  | { state: "error"; error: string }

// The customer's wishlist; null when signed out or nothing saved yet.
export async function retrieveWishlist(): Promise<Wishlist | null> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return null
  }
  return sdk.client
    .fetch<{ wishlist: Wishlist | null }>("/store/customers/me/wishlists", {
      headers,
      cache: "no-store",
    })
    .then(({ wishlist }) => wishlist)
    .catch(() => null)
}

export async function addToWishlist(variantId: string): Promise<WishlistActionResult> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return { state: "sign_in" }
  }
  try {
    await sdk.client.fetch("/store/customers/me/wishlists/items", {
      method: "POST",
      headers,
      body: { variant_id: variantId },
    })
    revalidatePath("/[countryCode]/(main)/account/@dashboard/wishlist", "page")
    return { state: "success" }
  } catch (error) {
    return { state: "error", error: (error as Error).message }
  }
}

export async function removeFromWishlist(itemId: string): Promise<WishlistActionResult> {
  const headers = await getAuthHeaders()
  try {
    await sdk.client.fetch(`/store/customers/me/wishlists/items/${itemId}`, {
      method: "DELETE",
      headers,
    })
    revalidatePath("/[countryCode]/(main)/account/@dashboard/wishlist", "page")
    return { state: "success" }
  } catch (error) {
    return { state: "error", error: (error as Error).message }
  }
}

// A link anyone can open for 30 days (WISHLIST_SHARE_DAYS on the backend).
export async function shareWishlist(): Promise<
  { state: "success"; token: string; expires_at: string } | { state: "error"; error: string }
> {
  const headers = await getAuthHeaders()
  try {
    const { token, expires_at } = await sdk.client.fetch<{ token: string; expires_at: string }>(
      "/store/customers/me/wishlists/share",
      { method: "POST", headers }
    )
    return { state: "success", token, expires_at }
  } catch (error) {
    return { state: "error", error: (error as Error).message }
  }
}

// A shared wishlist; null when the link is invalid or expired.
export async function retrieveSharedWishlist(token: string): Promise<Wishlist | null> {
  return sdk.client
    .fetch<{ wishlist: Wishlist }>(`/store/wishlists/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
    .then(({ wishlist }) => wishlist)
    .catch(() => null)
}

// The wishlist's products with prices for this country (the starter's product
// list, so prices and stock match the product pages).
export async function wishlistProducts(
  wishlist: Wishlist | null,
  countryCode: string
): Promise<HttpTypes.StoreProduct[]> {
  const ids = (wishlist?.items ?? [])
    .map((item) => item.product_variant?.product_id)
    .filter((id, index, all): id is string => !!id && all.indexOf(id) === index)
  if (!ids.length) {
    return []
  }
  try {
    const { response } = await listProducts({
      countryCode,
      queryParams: { id: ids, limit: ids.length },
    })
    return response.products
  } catch (error) {
    return medusaError(error)
  }
}
