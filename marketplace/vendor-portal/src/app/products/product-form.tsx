"use client"

import { useActionState } from "react"
import { addProduct, type ProductFormState } from "./actions"

// TASKS P6-09: the new-product form (one price; options come later).
export function ProductForm() {
  const [state, action, saving] = useActionState<ProductFormState, FormData>(addProduct, {})
  return (
    <form action={action} className="card flex flex-col gap-3 p-4">
      <h2 className="font-semibold">Add a product</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Name</span>
        <input className="field" name="title" required maxLength={200} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Description</span>
        <textarea className="field" name="description" rows={3} maxLength={4000} />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Price</span>
          <input className="field w-32" name="price" inputMode="decimal" placeholder="12.50" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Currency</span>
          <select className="field" name="currency" defaultValue="usd">
            <option value="usd">USD</option>
            <option value="khr">KHR</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">SKU (optional)</span>
          <input className="field w-40" name="sku" maxLength={80} />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="track_stock" defaultChecked /> Track stock
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Quantity in stock</span>
          <input className="field w-28" name="stock" inputMode="numeric" placeholder="0" />
        </label>
        <p className="text-xs text-ui-fg-subtle">
          Untick for made-to-order products: customers can always order them.
        </p>
      </div>
      <fieldset className="flex flex-col gap-1 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="status" value="proposed" defaultChecked /> Send for review
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="status" value="draft" /> Keep as a draft
        </label>
      </fieldset>
      {state.error && (
        <p role="alert" className="rounded-lg bg-ui-tag-red-bg px-3 py-2 text-sm text-ui-tag-red-text">
          {state.error}
        </p>
      )}
      {state.info && (
        <p className="rounded-lg bg-ui-tag-green-bg px-3 py-2 text-sm text-ui-tag-green-text">{state.info}</p>
      )}
      <button className="btn-primary self-start" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Add product"}
      </button>
    </form>
  )
}
