"use server"

import { sdk } from "@/lib/config"
import { getAuthHeaders } from "@/lib/data/cookies"

// One invoice per order (wholesale backend, TASKS P4-06). A company admin
// sees the whole company's invoices, other buyers their own orders'.
export type StoreInvoice = {
  id: string
  number: string
  order_id: string
  order_display_id: number | null
  company_name: string | null
  payment_terms: string | null
  issued_at: string
  due_at: string | null
  currency_code: string | null
  total: number
  amount_due: number
}

export const listInvoices = async (): Promise<StoreInvoice[]> => {
  const headers = { ...(await getAuthHeaders()) }

  return sdk.client
    .fetch<{ invoices: StoreInvoice[] }>(`/store/invoices`, {
      method: "GET",
      headers,
      cache: "no-store",
    })
    .then(({ invoices }) => invoices)
    .catch(() => [])
}
