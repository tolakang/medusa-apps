"use client"

import { useActionState } from "react"
import { fulfil, type FulfilState } from "./actions"

export function FulfilButton({ orderId }: { orderId: string }) {
  const [state, action, working] = useActionState<FulfilState, FormData>(fulfil, {})
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="order_id" value={orderId} />
      <button className="btn-primary" type="submit" disabled={working}>
        {working ? "Fulfilling…" : "Mark fulfilled"}
      </button>
      {state.error && (
        <span role="alert" className="text-xs text-ui-tag-red-text">
          {state.error}
        </span>
      )}
    </form>
  )
}
