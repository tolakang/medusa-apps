"use client"

import { useState } from "react"
import type { PaymentMethod } from "@/lib/api"
import { changeDue, formatMoney, quickTender } from "@/lib/cart"

// Payment (TASKS P2-10). Cash: enter what the customer gave, see the change.
// Card and QR: the money is taken on the shop's terminal or KHQR stand first;
// the sale only records it (TASKS F-038). Promotions can lower the final
// total, so cash change is shown again on the receipt from the real total.

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "qr", label: "QR (KHQR)" },
]

export function Payment({
  total,
  currency,
  onPay,
  onCancel,
}: {
  total: number
  currency: string
  onPay: (method: PaymentMethod, tendered: number | null) => Promise<void>
  onCancel: () => void
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash")
  const [tendered, setTendered] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cash = Number(tendered)
  const change = method === "cash" && tendered !== "" ? changeDue(total, cash) : null
  const ready = method !== "cash" || change !== null

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onPay(method, method === "cash" ? cash : null)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
        {METHODS.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={method === m.id}
            className={method === m.id ? "btn-primary" : "btn-secondary"}
            onClick={() => setMethod(m.id)}
            disabled={busy}
          >
            {m.label}
          </button>
        ))}
      </div>

      {method === "cash" ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Cash received</span>
            <input
              className="field text-right text-xl tabular-nums"
              inputMode="decimal"
              type="number"
              min={0}
              step="0.01"
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              autoFocus
            />
          </label>
          <div className="grid grid-cols-4 gap-2">
            {quickTender(total).map((a) => (
              <button key={a} className="btn-secondary px-2" onClick={() => setTendered(String(a))} disabled={busy}>
                {formatMoney(a, currency)}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-lg">
            <span>Change</span>
            <span className="font-semibold tabular-nums">{change === null ? "–" : formatMoney(change, currency)}</span>
          </div>
        </>
      ) : (
        <p className="rounded-lg bg-ui-bg-subtle p-3 text-sm">
          Take {formatMoney(total, currency)} on the {method === "card" ? "card terminal" : "KHQR stand"} first, then
          confirm here.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-ui-fg-error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={onCancel} disabled={busy}>
          Back
        </button>
        <button className="btn-primary flex-1" onClick={confirm} disabled={!ready || busy}>
          {busy ? "Recording sale…" : "Complete sale"}
        </button>
      </div>
    </div>
  )
}
