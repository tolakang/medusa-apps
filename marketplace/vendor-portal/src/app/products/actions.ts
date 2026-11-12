"use server"

import { revalidatePath } from "next/cache"
import { productBody, stockQuantity } from "@/lib/format"
import { backendFetch } from "@/lib/server/medusa"
import { requireVendor } from "@/lib/server/vendor"

export type ProductFormState = { error?: string; info?: string }

// TASKS P6-09: a vendor adds a product (POST /vendors/products, P6-04). It
// stays unpublished until the marketplace publishes it.
export async function addProduct(_: ProductFormState, form: FormData): Promise<ProductFormState> {
  const { token } = await requireVendor()
  const body = productBody({
    title: String(form.get("title") ?? ""),
    description: String(form.get("description") ?? ""),
    price: String(form.get("price") ?? ""),
    currency: String(form.get("currency") ?? "usd"),
    sku: String(form.get("sku") ?? ""),
    status: String(form.get("status") ?? "draft"),
    track_stock: form.get("track_stock") === "on",
    stock: String(form.get("stock") ?? ""),
  })
  if (typeof body === "string") {
    return { error: body }
  }
  const result = await backendFetch("/vendors/products", { token, method: "POST", body })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/products")
  return {
    info:
      body.status === "proposed"
        ? `"${body.title}" is sent for review. The marketplace publishes it.`
        : `"${body.title}" is saved as a draft.`,
  }
}

export type StockState = { error?: string; saved?: number }

// TASKS P6-15 (owner, F-080): the vendor sets how many it has in stock
// (POST /vendors/products/:id/stock, its own location).
export async function setProductStock(_: StockState, form: FormData): Promise<StockState> {
  const { token } = await requireVendor()
  const id = String(form.get("product_id") ?? "")
  if (!/^prod_[A-Za-z0-9]+$/.test(id)) {
    return { error: "Unknown product." }
  }
  const quantity = stockQuantity(String(form.get("quantity") ?? ""))
  if (typeof quantity === "string") {
    return { error: quantity }
  }
  const result = await backendFetch(`/vendors/products/${id}/stock`, {
    token,
    method: "POST",
    body: { quantity },
  })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/products")
  return { saved: quantity }
}
