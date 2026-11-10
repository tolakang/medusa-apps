"use server"

import { revalidatePath } from "next/cache"
import { selectionChange } from "@/lib/format"
import { backendFetch } from "@/lib/server/medusa"
import { getToken } from "@/lib/server/session"

export type SaveState = { error?: string; saved?: boolean }

// TASKS P5-08: saves which of the shop's products show in the seller's shop.
// The backend accepts only the shop's published products (P5-06).
export async function saveProducts(_: SaveState, form: FormData): Promise<SaveState> {
  const token = await getToken()
  if (!token) {
    return { error: "Your session has ended. Sign in again." }
  }
  const current = form.getAll("current").map(String)
  const wanted = form.getAll("selected").map(String)
  const { add, remove } = selectionChange(current, wanted)
  if (!add.length && !remove.length) {
    return { saved: true }
  }
  const result = await backendFetch("/sellers/me/products", {
    token,
    method: "POST",
    body: { add, remove },
  })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/products")
  revalidatePath("/")
  return { saved: true }
}
