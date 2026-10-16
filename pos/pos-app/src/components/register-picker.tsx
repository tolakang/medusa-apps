"use client"

import { useState } from "react"
import { api, ApiError, type Register, type Shift } from "@/lib/api"
import { formatMoney } from "@/lib/cart"

// Pick a register; continue its open shift or open one with the cash in the
// drawer (open-pos-shift, P2-04: one open shift per register).

export function RegisterPicker({
  registers,
  onSelect,
  onReload,
}: {
  registers: Register[] | null
  onSelect: (register: Register, shift: Shift) => void
  onReload: () => Promise<unknown>
}) {
  const [opening, setOpening] = useState<Register | null>(null)
  const [cash, setCash] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!registers) {
    return <p className="text-ui-fg-subtle">Loading registers…</p>
  }
  if (!registers.length) {
    return (
      <div className="card p-6">
        <p>No active registers. An admin sets them up in the shop admin (POS registers).</p>
      </div>
    )
  }

  const open = async () => {
    if (!opening) return
    setBusy(true)
    setError(null)
    try {
      const { shift } = await api<{ shift: Shift }>("shifts/open", {
        method: "POST",
        body: { register_id: opening.id, opening_cash: Number(cash) },
      })
      onSelect(opening, shift)
    } catch (e) {
      setError((e as Error).message)
      // Someone else opened it meanwhile: refresh so "Continue" shows.
      if (e instanceof ApiError && e.status === 400) {
        await onReload()
      }
    } finally {
      setBusy(false)
    }
  }

  const amount = Number(cash)
  const validCash = cash.trim() !== "" && Number.isFinite(amount) && amount >= 0

  return (
    <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
      {registers.map((r) => (
        <div key={r.id} className="card flex flex-col gap-3 p-4">
          <div>
            <div className="text-lg font-semibold">{r.name}</div>
            <div className="text-sm text-ui-fg-subtle">
              {r.code}
              {r.stock_location && ` · ${r.stock_location.name}`}
            </div>
          </div>
          {r.open_shift ? (
            <>
              <p className="text-sm">
                Shift open since {new Date(r.open_shift.opened_at).toLocaleString()} with{" "}
                {formatMoney(r.open_shift.opening_cash, r.open_shift.currency_code)} in the drawer.
              </p>
              <button className="btn-primary" onClick={() => onSelect(r, r.open_shift!)}>
                Continue shift
              </button>
            </>
          ) : opening?.id === r.id ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Cash in the drawer now</span>
                <input
                  className="field"
                  inputMode="decimal"
                  type="number"
                  min={0}
                  step="0.01"
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  autoFocus
                />
              </label>
              {error && <p className="text-sm text-ui-fg-error">{error}</p>}
              <div className="flex gap-2">
                <button className="btn-secondary flex-1" onClick={() => setOpening(null)} disabled={busy}>
                  Cancel
                </button>
                <button className="btn-primary flex-1" onClick={open} disabled={!validCash || busy}>
                  {busy ? "Opening…" : "Open shift"}
                </button>
              </div>
            </>
          ) : (
            <button
              className="btn-secondary"
              onClick={() => {
                setOpening(r)
                setCash("")
                setError(null)
              }}
            >
              Open shift
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
