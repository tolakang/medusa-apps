"use server"

import { sdk } from "@/lib/config"
import { addToCartBulk } from "@/lib/data/cart"
import { getAuthHeaders, getCacheOptions } from "@/lib/data/cookies"
import medusaError from "@/lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"

export const retrieveOrder = async (id: string) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("orders")),
  }

  return sdk.client
    .fetch<HttpTypes.StoreOrderResponse>(`/store/orders/${id}`, {
      method: "GET",
      query: {
        fields:
          "*payment_collections.payments,*items,+items.metadata,*items.variant,*items.product",
      },
      headers,
      next,
    })
    .then(({ order }) => order)
    .catch((err) => medusaError(err))
}

export const listOrders = async (
  limit: number = 10,
  offset: number = 0,
  filters?: Record<string, any>
) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("orders")),
  }

  return sdk.client
    .fetch<HttpTypes.StoreOrderListResponse>(`/store/orders`, {
      method: "GET",
      query: {
        limit,
        offset,
        order: "-created_at",
        fields: "*items,+items.metadata,*items.variant,*items.product",
        ...filters,
      },
      headers,
      next,
    })
    .then(({ orders }) => orders)
    .catch((err) => medusaError(err))
}

// Reorder (BUILD_PLAN.md §6.4): puts an earlier order's items in the cart
// again, at today's prices. Items whose variant no longer exists are skipped.
export const reorder = async (
  orderId: string,
  countryCode: string
): Promise<{ added: number; skipped: number; error?: string }> => {
  const order = await retrieveOrder(orderId).catch(() => null)

  if (!order) {
    return { added: 0, skipped: 0, error: "Order not found." }
  }

  const items = order.items ?? []
  const lineItems = items
    .filter((item) => item.variant_id && item.variant)
    .map((item) => ({
      variant_id: item.variant_id as string,
      quantity: item.quantity,
    }))
  const skipped = items.length - lineItems.length

  if (!lineItems.length) {
    return { added: 0, skipped, error: "None of these items can be ordered any more." }
  }

  const { error } = await addToCartBulk({ lineItems, countryCode })

  return error ? { added: 0, skipped, error } : { added: lineItems.length, skipped }
}
