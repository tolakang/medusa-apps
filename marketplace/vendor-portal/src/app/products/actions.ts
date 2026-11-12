"use server"

import { revalidatePath } from "next/cache"
import { productBody } from "@/lib/format"
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
