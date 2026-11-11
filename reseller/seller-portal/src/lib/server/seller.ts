import "server-only"
import { redirect } from "next/navigation"
import { backendFetch } from "./medusa"
import { getToken } from "./session"

// TASKS P5-08: every page runs as the signed-in seller. No valid token, or
// the backend refuses it (suspended seller, expired token: 401/403) → /logout,
// which clears the cookie and opens sign-in. Other failures throw (error page).

export type Seller = {
  id: string
  handle: string
  name: string
  email: string
  domain: string | null
  status: "pending" | "active" | "suspended"
  commission_rate: number | null
  sales_channel?: { id: string; name: string } | null
}

export async function requireSeller(): Promise<{ token: string; seller: Seller }> {
  const token = await getToken()
  if (!token) {
    redirect("/logout")
  }
  const me = await backendFetch<{ seller: Seller }>("/sellers/me", { token })
  if (!me.ok) {
    // Only a refused session signs the seller out. A backend that is down or
    // slow (502, timeout) shows the error page instead, so a short outage
    // doesn't sign every seller out (REVIEW_FIXES C5).
    if (me.status === 401 || me.status === 403) {
      redirect("/logout")
    }
    throw new Error(me.message)
  }
  return { token, seller: me.data.seller }
}

/** A backend read as the seller; a refused token signs them out. */
export async function sellerGet<T>(
  token: string,
  path: string,
  query?: Record<string, string>
): Promise<T> {
  const result = await backendFetch<T>(path, { token, query })
  if (!result.ok) {
    if (result.status === 401) {
      redirect("/logout")
    }
    throw new Error(result.message)
  }
  return result.data
}
