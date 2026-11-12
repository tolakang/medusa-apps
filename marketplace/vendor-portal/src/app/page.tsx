import Link from "next/link"
import { Shell } from "@/components/shell"
import { day, money, toFulfil } from "@/lib/format"
import { requireVendor, vendorGet } from "@/lib/server/vendor"
import type { VendorOrder } from "./orders/page"

type Payouts = { not_yet_paid_out: { currency_code: string; amount: number }[] }

// TASKS P6-09: the vendor's overview: orders to fulfil and what the
// marketplace owes it that isn't in a payout yet.
export default async function OverviewPage() {
  const { token, vendor } = await requireVendor()
  if (vendor.status !== "active") {
    return <Shell vendor={vendor} active="/">{null}</Shell>
  }
  const [{ orders }, payouts] = await Promise.all([
    vendorGet<{ orders: VendorOrder[] }>(token, "/vendors/me/orders"),
    vendorGet<Payouts>(token, "/vendors/me/payouts"),
  ])
  const open = orders.filter((o) => o.status !== "canceled" && !o.fully_fulfilled)

  return (
    <Shell vendor={vendor} active="/">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-sm text-ui-fg-subtle">Orders to fulfil</p>
          <p className="text-3xl font-semibold">{open.length}</p>
          <Link className="text-sm text-ui-fg-interactive" href="/orders">
            Open orders
          </Link>
        </div>
        <div className="card p-4">
          <p className="text-sm text-ui-fg-subtle">Earned, not paid out yet</p>
          {payouts.not_yet_paid_out.length ? (
            payouts.not_yet_paid_out.map((p) => (
              <p key={p.currency_code} className="text-3xl font-semibold">
                {money(p.amount, p.currency_code)}
              </p>
            ))
          ) : (
            <p className="text-3xl font-semibold">—</p>
          )}
          <Link className="text-sm text-ui-fg-interactive" href="/payouts">
            Payouts
          </Link>
        </div>
      </section>
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Latest orders</h2>
        {orders.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {orders.slice(0, 5).map((o) => (
              <li key={o.id} className="flex justify-between gap-2">
                <span>
                  #{o.display_id} · {day(o.created_at)}
                </span>
                <span>
                  {money(o.total, o.currency_code)} ·{" "}
                  {o.status === "canceled" ? "canceled" : toFulfil(o.remaining) ? "to fulfil" : "fulfilled"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ui-fg-subtle">No orders yet.</p>
        )}
      </section>
    </Shell>
  )
}
