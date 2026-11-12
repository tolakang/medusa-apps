import "server-only"
import { redirect } from "next/navigation"
import { backendFetch } from "./medusa"
import { getToken } from "./session"

// TASKS P6-09: every page runs as the signed-in vendor admin. No valid token,
// or the backend refuses it (suspended vendor, expired token: 401) →
// /logout. A vendor waiting for approval (403 on everything but
// /vendors/me) sees its pages with the waiting notice and no data. Other
// failures throw (error page).

export type Vendor = {
  id: string
  handle: string
  name: string
  email: string
  logo: string | null
  status: "pending" | "active" | "suspended"
  commission_rate: number | null
}
export type VendorAdmin = { id: string; email: string; first_name: string | null; last_name: string | null }

export async function requireVendor(): Promise<{ token: string; vendor: Vendor; admin: VendorAdmin }> {
  const token = await getToken()
  if (!token) {
    redirect("/logout")
  }
  const me = await backendFetch<{ vendor: Vendor; vendor_admin: VendorAdmin }>("/vendors/me", { token })
  if (!me.ok) {
    // Only a refused session signs the vendor out; an outage shows the error
    // page (as the seller portal, REVIEW_FIXES C5).
    if (me.status === 401 || me.status === 403) {
      redirect("/logout")
    }
    throw new Error(me.message)
  }
  return { token, vendor: me.data.vendor, admin: me.data.vendor_admin }
}

/** A backend read as the vendor; a refused token signs them out. */
export async function vendorGet<T>(token: string, path: string, query?: Record<string, string>): Promise<T> {
  const result = await backendFetch<T>(path, { token, query })
  if (!result.ok) {
    if (result.status === 401) {
      redirect("/logout")
    }
    throw new Error(result.message)
  }
  return result.data
}
