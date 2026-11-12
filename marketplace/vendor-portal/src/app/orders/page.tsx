import { Shell } from "@/components/shell"
import { day, money, toFulfil } from "@/lib/format"
import { requireVendor, vendorGet } from "@/lib/server/vendor"
import { FulfilButton } from "./fulfil-button"

export type VendorOrder = {
  id: string
  display_id: number
  status: string
  created_at: string
  email: string | null
  currency_code: string
  total: number
  shipping_address: {
    first_name: string | null
    last_name: string | null
    address_1: string | null
    address_2: string | null
    city: string | null
    province: string | null
    postal_code: string | null
    phone: string | null
  } | null
  items: { id: string; title: string; variant_title: string | null; variant_sku: string | null; quantity: number }[]
  shipping_methods: { name: string }[]
  remaining: Record<string, number>
  fully_fulfilled: boolean
  commission: { rate: number; amount: number; payout_amount: number; status: string } | null
}

// TASKS P6-09: the vendor's orders (its child orders of each checkout, P6-05)
// with the delivery address and "Mark fulfilled" (P6-10).
export default async function OrdersPage() {
  const { token, vendor } = await requireVendor()
  if (vendor.status !== "active") {
    return <Shell vendor={vendor} active="/orders">{null}</Shell>
  }
  const { orders } = await vendorGet<{ orders: VendorOrder[] }>(token, "/vendors/me/orders")
  return (
    <Shell vendor={vendor} active="/orders">
      {orders.length ? (
        orders.map((o) => {
          const a = o.shipping_address
          const left = toFulfil(o.remaining)
          return (
            <section key={o.id} className="card flex flex-col gap-3 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    Order #{o.display_id} · {day(o.created_at)}
                  </h2>
                  <p className="text-ui-fg-subtle">
                    {o.status === "canceled" ? "Canceled" : left ? `${left} to fulfil` : "Fulfilled"} ·{" "}
                    {o.shipping_methods.map((m) => m.name).join(", ")}
                  </p>
                </div>
                {o.status !== "canceled" && left > 0 && <FulfilButton orderId={o.id} />}
              </div>
              <ul>
                {o.items.map((i) => (
                  <li key={i.id}>
                    {i.quantity} × {i.title}
                    {i.variant_title && i.variant_title !== "Default" ? ` (${i.variant_title})` : ""}
                    {i.variant_sku ? ` · ${i.variant_sku}` : ""}
                  </li>
                ))}
              </ul>
              {a && (
                <p className="text-ui-fg-subtle">
                  Deliver to {[a.first_name, a.last_name].filter(Boolean).join(" ")}, {a.address_1}
                  {a.address_2 ? `, ${a.address_2}` : ""}, {a.city}, {a.province} {a.postal_code}
                  {a.phone ? ` · ${a.phone}` : ""}
                </p>
              )}
              <p>
                Total {money(o.total, o.currency_code)}
                {o.commission &&
                  ` · commission ${money(o.commission.amount, o.currency_code)} (${o.commission.rate}%) · you get ${money(
                    o.commission.payout_amount,
                    o.currency_code
                  )}`}
              </p>
            </section>
          )
        })
      ) : (
        <p className="card p-4 text-sm text-ui-fg-subtle">No orders yet.</p>
      )}
    </Shell>
  )
}
