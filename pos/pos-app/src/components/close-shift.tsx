"use client"

import { useState } from "react"
import { api, type Shift } from "@/lib/api"
import { formatMoney } from "@/lib/cart"

// Close the shift (TASKS P2-10 over close-pos-shift, P2-04): count the drawer,
// the backend computes the expected cash from the shift's cash sales and
// returns the variance (counted − expected; negative = cash missing).

type Closed = { shift: Shift & { expected_cash: number | string; counted_cash: number | string }; variance: number }

export function CloseShift({ shift, onCancel, onDone }: { shift: Shift; onCancel: () => void; onDone: () => void }) {
  const [counted, setCounted] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Closed | null>(null)
  const currency = shift.currency_code

  const close = async () => {
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { shift_id: shift.id, counted_cash: Number(counted) }
      if (notes.trim()) body.notes = notes.trim()
      setResult(await api<Closed>("shifts/close", { method: "POST", body }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const v = result.variance
    return (
      <div className="card mx-auto flex max-w-md flex-col gap-3 p-6">
        <h2 className="text-xl font-semibold">Shift closed</h2>
        <Line label="Opening cash" value={formatMoney(shift.opening_cash, currency)} />
        <Line label="Expected in drawer" value={formatMoney(result.shift.expected_cash, currency)} />
        <Line label="Counted" value={formatMoney(result.shift.counted_cash, currency)} />
        <div
          className={`flex justify-between rounded-lg p-3 text-lg font-semibold ${
            v === 0 ? "bg-ui-tag-green-bg text-ui-tag-green-text" : v < 0 ? "bg-ui-tag-red-bg text-ui-tag-red-text" : "bg-ui-tag-orange-bg text-ui-tag-orange-text"
          }`}
        >
          <span>{v === 0 ? "Drawer matches" : v < 0 ? "Cash short" : "Cash over"}</span>
          <span className="tabular-nums">{formatMoney(Math.abs(v), currency)}</span>
        </div>
        <button className="btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    )
  }

  const amount = Number(counted)
  const valid = counted.trim() !== "" && Number.isFinite(amount) && amount >= 0

  return (
    <div className="card mx-auto flex max-w-md flex-col gap-3 p-6">
      <h2 className="text-xl font-semibold">Close shift</h2>
      <p className="text-ui-fg-subtle">
        Count all the cash in the drawer, including the {formatMoney(shift.opening_cash, currency)} you started with.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Cash counted</span>
        <input
          className="field text-right text-xl tabular-nums"
          inputMode="decimal"
          type="number"
          min={0}
          step="0.01"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Notes (optional)</span>
        <textarea className="field" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-ui-fg-error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={onCancel} disabled={busy}>
          Back to selling
        </button>
        <button className="btn-danger flex-1" onClick={close} disabled={!valid || busy}>
          {busy ? "Closing…" : "Close shift"}
        </button>
      </div>
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ui-fg-subtle">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
