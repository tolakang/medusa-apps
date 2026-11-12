"use server"

import { revalidatePath } from "next/cache"
import { backendFetch } from "@/lib/server/medusa"
import { requireVendor } from "@/lib/server/vendor"

export type FulfilState = { error?: string; done?: boolean }

// TASKS P6-09: the vendor fulfils what's left of one of its orders
// (POST /vendors/me/orders/:id/fulfillments; only its own, P6-10).
export async function fulfil(_: FulfilState, form: FormData): Promise<FulfilState> {
  const { token } = await requireVendor()
  const id = String(form.get("order_id") ?? "")
  if (!/^order_[A-Za-z0-9]+$/.test(id)) {
    return { error: "Unknown order." }
  }
  const result = await backendFetch(`/vendors/me/orders/${id}/fulfillments`, { token, method: "POST" })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/orders")
  revalidatePath("/")
  return { done: true }
}
