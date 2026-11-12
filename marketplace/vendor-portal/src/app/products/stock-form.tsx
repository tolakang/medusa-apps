"use client"

import { useActionState } from "react"
import { setProductStock, type StockState } from "./actions"

// TASKS P6-15: edit a product's quantity in stock.
export function StockForm({ productId, quantity }: { productId: string; quantity: number }) {
  const [state, action, saving] = useActionState<StockState, FormData>(setProductStock, {})
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="product_id" value={productId} />
      <input
        className="field w-20"
        name="quantity"
        inputMode="numeric"
        defaultValue={String(quantity)}
        aria-label="Quantity in stock"
      />
      <button className="btn-secondary" type="submit" disabled={saving}>
        {saving ? "…" : "Save"}
      </button>
      {state.error && (
        <span role="alert" className="text-xs text-ui-tag-red-text">
          {state.error}
        </span>
      )}
    </form>
  )
}
