"use server"

import { sdk } from "@lib/config"
import { getCacheOptions } from "./cookies"
import { CATALOG_REVALIDATE_SECONDS } from "@lib/catalog-cache"

// Marketplace vendors for the storefront (TASKS P6-08): the backend's
// GET /store/vendors/:handle and GET /store/product-vendors.

export type VendorSummary = { handle: string; name: string }
export type VendorShop = {
  vendor: { id: string; handle: string; name: string; logo: string | null }
  product_ids: string[]
}

/** An active vendor's shop page, or null when there is none. */
export const getVendorShop = async (handle: string): Promise<VendorShop | null> => {
  const next = {
    ...(await getCacheOptions(["vendor", handle].join("-"))),
    revalidate: CATALOG_REVALIDATE_SECONDS,
  }
  return sdk.client
    .fetch<VendorShop>(`/store/vendors/${encodeURIComponent(handle)}`, {
      method: "GET",
      next,
      cache: "force-cache",
    })
    .catch(() => null)
}

/** Who sells each product (active vendors only), by product id. */
export const getProductVendors = async (
  productIds: string[]
): Promise<Record<string, VendorSummary>> => {
  if (!productIds.length) {
    return {}
  }
  const next = {
    ...(await getCacheOptions("product-vendors")),
    revalidate: CATALOG_REVALIDATE_SECONDS,
  }
  return sdk.client
    .fetch<{ product_vendors: { product_id: string; vendor: VendorSummary }[] }>(
      `/store/product-vendors`,
      { method: "GET", query: { product_id: productIds }, next, cache: "force-cache" }
    )
    .then(({ product_vendors }) =>
      Object.fromEntries(product_vendors.map((p) => [p.product_id, p.vendor]))
    )
    .catch(() => ({}))
}
