"use client"

import { useState } from "react"
import { api, type Customer } from "@/lib/api"

// Optional customer for the sale (TASKS P2-10): find by name, email or phone
// (GET /pos/customers?q=) or add a walk-in buyer (POST /pos/customers: a name
// plus a phone or an email).

const name = (c: Customer) => [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone || c.id

export function CustomerPicker({ customer, onChange }: { customer: Customer | null; onChange: (c: Customer | null) => void }) {
  const [mode, setMode] = useState<"idle" | "search" | "add">("idle")
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Customer[] | null>(null)
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", email: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setMode("idle")
    setQ("")
    setResults(null)
    setError(null)
    setForm({ first_name: "", last_name: "", phone: "", email: "" })
  }

  const search = async () => {
    setBusy(true)
    setError(null)
    try {
      const { customers } = await api<{ customers: Customer[] }>("customers", { query: { q: q.trim() } })
      setResults(customers)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ""))
      const { customer } = await api<{ customer: Customer }>("customers", { method: "POST", body })
      onChange(customer)
      reset()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (customer) {
    return (
      <div className="card flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-sm text-ui-fg-subtle">Customer</div>
          <div className="truncate font-medium">{name(customer)}</div>
          <div className="truncate text-sm text-ui-fg-subtle">{customer.phone ?? customer.email}</div>
        </div>
        <button className="btn-secondary" onClick={() => onChange(null)}>
          Remove
        </button>
      </div>
    )
  }

  return (
    <div className="card flex flex-col gap-3 p-4">
      {mode === "idle" && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-ui-fg-subtle">No customer (walk-in)</span>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setMode("search")}>
              Find
            </button>
            <button className="btn-secondary" onClick={() => setMode("add")}>
              New
            </button>
          </div>
        </div>
      )}

      {mode === "search" && (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (q.trim().length >= 2) search()
            }}
          >
            <input
              className="field"
              placeholder="Name, phone or email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            <button className="btn-primary" type="submit" disabled={busy || q.trim().length < 2}>
              Find
            </button>
          </form>
          {results && !results.length && <p className="text-sm text-ui-fg-subtle">No customer found.</p>}
          {results?.map((c) => (
            <button
              key={c.id}
              className="btn-secondary justify-between text-left"
              onClick={() => {
                onChange(c)
                reset()
              }}
            >
              <span className="truncate">{name(c)}</span>
              <span className="truncate text-sm text-ui-fg-subtle">{c.phone ?? c.email}</span>
            </button>
          ))}
        </>
      )}

      {mode === "add" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <input
              className="field"
              placeholder="First name"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              required
              autoFocus
            />
            <input
              className="field"
              placeholder="Last name"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </div>
          <input
            className="field"
            placeholder="Phone, e.g. 012 345 678"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            className="field"
            placeholder="Email (optional if phone given)"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <button
            className="btn-primary"
            type="submit"
            disabled={busy || !form.first_name.trim() || !(form.phone.trim() || form.email.trim())}
          >
            {busy ? "Saving…" : "Add customer"}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-ui-fg-error">
          {error}
        </p>
      )}
      {mode !== "idle" && (
        <button className="text-sm text-ui-fg-subtle" onClick={reset}>
          Cancel
        </button>
      )}
    </div>
  )
}
