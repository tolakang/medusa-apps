import { redirect } from "next/navigation"
import { Till } from "@/components/till"
import { backendFetch } from "@/lib/server/medusa"
import { getToken } from "@/lib/server/session"

// The till (TASKS P2-10). Server side: check the session and load the cashier;
// everything after that runs in the browser through /api/pos.

export const dynamic = "force-dynamic"

export default async function Home() {
  const token = await getToken()
  if (!token) {
    redirect("/login")
  }
  const me = await backendFetch<{ cashier: { id: string; name: string; email: string } }>("/pos/cashiers/me", {
    token,
  })
  if (!me.ok) {
    // Expired token or deactivated cashier: the sign-in page explains.
    redirect("/login")
  }
  return <Till cashier={me.data.cashier} />
}
