import { Shell } from "@/components/shell"
import { day, money } from "@/lib/format"
import { requireVendor, vendorGet } from "@/lib/server/vendor"

type Payouts = {
  vendor_payouts: {
    id: string
    amount: number
    currency_code: string
    period: string
    status: "pending" | "paid" | "cancelled"
    paid_at: string | null
    reference: string | null
  }[]
  not_yet_paid_out: { currency_code: string; amount: number }[]
}

// TASKS P6-09: what the marketplace has paid and owes the vendor
// (GET /vendors/me/payouts, P6-06): one payout per month and currency.
export default async function PayoutsPage() {
  const { token, vendor } = await requireVendor()
  if (vendor.status !== "active") {
    return <Shell vendor={vendor} active="/payouts">{null}</Shell>
  }
  const data = await vendorGet<Payouts>(token, "/vendors/me/payouts")
  return (
    <Shell vendor={vendor} active="/payouts">
      <section className="card p-4 text-sm">
        <h2 className="mb-1 font-semibold">Earned, not in a payout yet</h2>
        {data.not_yet_paid_out.length ? (
          data.not_yet_paid_out.map((p) => (
            <p key={p.currency_code}>{money(p.amount, p.currency_code)}</p>
          ))
        ) : (
          <p className="text-ui-fg-subtle">Nothing yet.</p>
        )}
        <p className="mt-2 text-ui-fg-subtle">
          Each month the marketplace makes one payout per currency: your order totals minus its commission.
        </p>
      </section>
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Payouts</h2>
        {data.vendor_payouts.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-ui-fg-subtle">
              <tr>
                <th className="py-1">Month</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {data.vendor_payouts.map((p) => (
                <tr key={p.id} className="border-t border-ui-border-base">
                  <td className="py-1">{p.period}</td>
                  <td>{money(p.amount, p.currency_code)}</td>
                  <td>{p.status === "paid" ? `Paid ${day(p.paid_at)}` : p.status === "pending" ? "To be paid" : "Cancelled"}</td>
                  <td>{p.reference ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-ui-fg-subtle">No payouts yet.</p>
        )}
      </section>
    </Shell>
  )
}
