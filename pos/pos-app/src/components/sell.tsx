"use client"

import { useState } from "react"
import { api, type Customer, type LookupVariant, type PaymentMethod, type ReceiptOrder, type Register, type Shift } from "@/lib/api"
import {
  addLine,
  cartTotal,
  checkoutItems,
  formatMoney,
  itemCount,
  lineFromVariant,
  lineTotal,
  setQuantity,
  type CartLine,
} from "@/lib/cart"
import { CustomerPicker } from "./customer-picker"
import { Payment } from "./payment"
import { Receipt } from "./receipt"
import { Scanner } from "./scanner"

// One sale at a time (TASKS P2-10): scan → cart → optional customer and promo
// code → payment → receipt. POST /pos/checkout (P2-05/P2-06) prices the sale,
// applies promotions, records the payment and links the order to the shift.

type Done = { order: ReceiptOrder; method: PaymentMethod; tendered: number | null; customer: Customer | null }

export function Sell({ register, shift }: { register: Register; shift: Shift }) {
  const currency = shift.currency_code
  const [cart, setCart] = useState<CartLine[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [promo, setPromo] = useState("")
  const [choices, setChoices] = useState<LookupVariant[] | null>(null)
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null)
  const [looking, setLooking] = useState(false)
  const [paying, setPaying] = useState(false)
  const [done, setDone] = useState<Done | null>(null)

  const add = (v: LookupVariant) => {
    setCart((c) => addLine(c, lineFromVariant(v)))
    setChoices(null)
    setMessage({ tone: "info", text: `Added ${v.product.title ?? v.title ?? v.sku}` })
  }

  const lookup = async (code: string) => {
    setLooking(true)
    setMessage(null)
    try {
      const { variants } = await api<{ variants: LookupVariant[] }>("products/lookup", {
        query: { code, shift_id: shift.id },
      })
      if (variants.length === 1) {
        add(variants[0])
      } else {
        setChoices(variants)
      }
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message })
    } finally {
      setLooking(false)
    }
  }

  const pay = async (method: PaymentMethod, tendered: number | null) => {
    const body: Record<string, unknown> = { shift_id: shift.id, items: checkoutItems(cart), payment_method: method }
    if (customer) body.customer_id = customer.id
    if (promo.trim()) body.promo_codes = [promo.trim()]
    const { order } = await api<{ order: ReceiptOrder }>("checkout", { method: "POST", body })
    setDone({ order, method, tendered, customer })
    setPaying(false)
  }

  const newSale = () => {
    setCart([])
    setCustomer(null)
    setPromo("")
    setDone(null)
    setMessage(null)
  }

  if (done) {
    return (
      <Receipt
        register={register}
        order={done.order}
        method={done.method}
        tendered={done.tendered}
        customer={done.customer}
        onNext={newSale}
      />
    )
  }

  const total = cartTotal(cart)
  const unpriced = cart.some((l) => l.unit_price === null)

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_380px]">
      <section className="flex flex-col gap-3">
        <Scanner onCode={lookup} busy={looking} />
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={message.tone === "error" ? "text-ui-fg-error" : "text-ui-fg-subtle"}
          >
            {message.text}
          </p>
        )}
        {choices && (
          <div className="card p-3">
            <p className="mb-2 font-medium">Several products match. Pick one:</p>
            <div className="flex flex-col gap-2">
              {choices.map((v) => (
                <button key={v.id} className="btn-secondary justify-between" onClick={() => add(v)}>
                  <span>
                    {v.product.title} {v.title && `· ${v.title}`}
                  </span>
                  <span>{formatMoney(v.price, currency)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card divide-y divide-ui-border-base">
          {!cart.length && <p className="p-6 text-center text-ui-fg-subtle">Scan an item to start the sale.</p>}
          {cart.map((l) => (
            <div key={l.variant_id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{l.title}</div>
                <div className="truncate text-sm text-ui-fg-subtle">
                  {[l.variant_title, l.sku].filter(Boolean).join(" · ")} · {formatMoney(l.unit_price, currency)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="btn-secondary h-11 w-11 p-0"
                  aria-label={`One less ${l.title}`}
                  onClick={() => setCart((c) => setQuantity(c, l.variant_id, l.quantity - 1))}
                >
                  −
                </button>
                <span className="w-10 text-center text-lg tabular-nums">{l.quantity}</span>
                <button
                  className="btn-secondary h-11 w-11 p-0"
                  aria-label={`One more ${l.title}`}
                  onClick={() => setCart((c) => setQuantity(c, l.variant_id, l.quantity + 1))}
                >
                  +
                </button>
              </div>
              <div className="w-24 text-right tabular-nums">{formatMoney(lineTotal(l), currency)}</div>
              <button
                className="text-sm text-ui-fg-error"
                aria-label={`Remove ${l.title}`}
                onClick={() => setCart((c) => setQuantity(c, l.variant_id, 0))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <aside className="flex flex-col gap-3">
        <CustomerPicker customer={customer} onChange={setCustomer} />
        <div className="card p-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Promotion code</span>
            <input
              className="field"
              value={promo}
              onChange={(e) => setPromo(e.target.value.toUpperCase())}
              placeholder="Optional"
              autoComplete="off"
            />
          </label>
        </div>
        <div className="card flex flex-col gap-3 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-ui-fg-subtle">{itemCount(cart)} items</span>
            <span className="text-3xl font-semibold tabular-nums">{formatMoney(total, currency)}</span>
          </div>
          <p className="text-xs text-ui-fg-subtle">
            Estimate before promotions and tax; the receipt shows the final total.
          </p>
          {unpriced && <p className="text-sm text-ui-fg-error">Some items have no price in {currency.toUpperCase()}.</p>}
          {paying ? (
            <Payment total={total} currency={currency} onPay={pay} onCancel={() => setPaying(false)} />
          ) : (
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={newSale} disabled={!cart.length}>
                Clear
              </button>
              <button className="btn-primary flex-1" onClick={() => setPaying(true)} disabled={!cart.length || unpriced}>
                Pay
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
