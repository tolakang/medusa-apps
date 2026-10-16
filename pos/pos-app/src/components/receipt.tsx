"use client"

import type { Customer, PaymentMethod, ReceiptOrder, Register } from "@/lib/api"
import { changeDue, formatMoney } from "@/lib/cart"

// The receipt (TASKS P2-10), from the order the backend returned. Print uses
// the browser's print dialog on 80 mm paper (globals.css @media print).

const METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", card: "Card", qr: "QR (KHQR)" }

export function Receipt({
  register,
  order,
  method,
  tendered,
  customer,
  onNext,
}: {
  register: Register
  order: ReceiptOrder
  method: PaymentMethod
  tendered: number | null
  customer: Customer | null
  onNext: () => void
}) {
  const currency = order.currency_code
  const total = Number(order.total)
  // Change from the real total (promotions and tax applied by the backend).
  const change = tendered !== null ? changeDue(total, tendered) : null
  const short = tendered !== null && change === null ? total - tendered : null

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <div className="no-print card p-4 text-center">
        <div className="text-sm text-ui-fg-subtle">Sale complete</div>
        {method === "cash" && change !== null && (
          <div className="mt-1 text-3xl font-semibold tabular-nums">Change {formatMoney(change, currency)}</div>
        )}
        {short !== null && (
          <div role="alert" className="mt-1 text-xl font-semibold text-ui-fg-error">
            Still to collect: {formatMoney(short, currency)}
          </div>
        )}
      </div>

      <div id="receipt" className="card p-5 font-mono text-sm">
        <div className="text-center">
          <div className="text-base font-bold">{register.name}</div>
          {register.stock_location && <div>{register.stock_location.name}</div>}
          <div className="mt-1">
            Receipt #{order.display_id} · {new Date(order.created_at).toLocaleString()}
          </div>
        </div>
        <hr className="my-3 border-dashed border-ui-border-strong" />
        {order.items.map((i) => (
          <div key={i.id} className="mb-1">
            <div className="flex justify-between gap-2">
              <span className="truncate">{i.title}</span>
              <span className="tabular-nums">{formatMoney(i.total, currency)}</span>
            </div>
            <div className="text-xs text-ui-fg-subtle">
              {Number(i.quantity)} × {formatMoney(i.unit_price, currency)}
              {i.variant_title && ` · ${i.variant_title}`}
            </div>
          </div>
        ))}
        <hr className="my-3 border-dashed border-ui-border-strong" />
        <Row label="Subtotal" value={formatMoney(order.subtotal, currency)} />
        {Number(order.discount_total) > 0 && (
          <Row label="Discount" value={`−${formatMoney(order.discount_total, currency)}`} />
        )}
        {Number(order.tax_total) > 0 && <Row label="Tax" value={formatMoney(order.tax_total, currency)} />}
        <Row label="Total" value={formatMoney(total, currency)} bold />
        <Row label={`Paid (${METHOD_LABEL[method]})`} value={formatMoney(tendered ?? total, currency)} />
        {change !== null && method === "cash" && <Row label="Change" value={formatMoney(change, currency)} />}
        {customer && (
          <div className="mt-3">
            Customer: {[customer.first_name, customer.last_name].filter(Boolean).join(" ")}
          </div>
        )}
        <div className="mt-4 text-center">Thank you!</div>
      </div>

      <div className="no-print flex gap-2">
        <button className="btn-secondary flex-1" onClick={() => window.print()}>
          Print receipt
        </button>
        <button className="btn-primary flex-1" onClick={onNext} autoFocus>
          Next sale
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
