"use client"

import { reorder } from "@/lib/data/orders"
import Button from "@/modules/common/components/button"
import { toast } from "@medusajs/ui"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"

// Reorder and invoice download for a placed order (BUILD_PLAN.md §6.4).
const OrderActions = ({ orderId }: { orderId: string }) => {
  const { countryCode } = useParams<{ countryCode: string }>()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const handleReorder = async () => {
    setBusy(true)
    const result = await reorder(orderId, countryCode).catch(() => ({
      added: 0,
      skipped: 0,
      error: "Something went wrong. Please try again.",
    }))
    setBusy(false)

    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(
      result.skipped
        ? `Added ${result.added} items to your cart. ${result.skipped} can't be ordered any more.`
        : `Added ${result.added} ${result.added === 1 ? "item" : "items"} to your cart.`
    )
    router.push(`/${countryCode}/cart`)
  }

  return (
    <div className="flex gap-2 items-center">
      <a href={`/api/invoices/${orderId}`} data-testid="order-invoice-link">
        <Button variant="secondary">Invoice (PDF)</Button>
      </a>
      <Button onClick={handleReorder} disabled={busy} data-testid="reorder-button">
        {busy ? "Adding…" : "Reorder"}
      </Button>
    </div>
  )
}

export default OrderActions
