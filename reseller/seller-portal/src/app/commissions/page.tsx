import Link from "next/link"
import { Pager, Shell } from "@/components/shell"
import { COMMISSION_STATUSES, commissionStatus, day, money, pageFrom } from "@/lib/format"
import { requireSeller, sellerGet } from "@/lib/server/seller"

type Commission = {
  id: string
  order_id: string
  order_total: number
  rate: number
  amount: number
  currency_code: string
  status: string
  paid_at: string | null
  created_at: string
}

const LIMIT = 20
const LABELS: Record<string, string> = {
  pending: "Waiting",
  approved: "Due",
  paid: "Paid",
  cancelled: "Cancelled",
}

// TASKS P5-08: what you earned per order. Pending → approved on the payout
// day → paid when the shop has paid you (P5-05).
export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>
}) {
  const { token, seller } = await requireSeller()
  const params = await searchParams
  const page = pageFrom(params.page)
  const status = commissionStatus(params.status)
  const { commissions, count, totals } = await sellerGet<{
    commissions: Commission[]
    count: number
    totals: Record<string, Record<string, number>>
  }>(token, "/sellers/me/commissions", {
    limit: String(LIMIT),
    offset: String((page - 1) * LIMIT),
    ...(status ? { status } : {}),
  })

  return (
    <Shell seller={seller} active="/commissions">
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Status">
        <Link className={!status ? "btn-primary" : "btn-secondary"} href="/commissions">
          All
        </Link>
        {COMMISSION_STATUSES.map((s) => (
          <Link key={s} className={status === s ? "btn-primary" : "btn-secondary"} href={`/commissions?status=${s}`}>
            {LABELS[s]}
            {totals[s] &&
              ` · ${Object.entries(totals[s]).map(([c, a]) => money(a, c)).join(" · ")}`}
          </Link>
        ))}
      </nav>
      <section className="card overflow-x-auto p-4">
        {commissions.length === 0 ? (
          <p className="text-sm text-ui-fg-subtle">No commissions here yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Order total</th>
                <th>Rate</th>
                <th>Commission</th>
                <th>Status</th>
                <th>Paid on</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id}>
                  <td>{day(c.created_at)}</td>
                  <td>{money(c.order_total, c.currency_code)}</td>
                  <td>{c.rate} %</td>
                  <td>{money(c.amount, c.currency_code)}</td>
                  <td>{LABELS[c.status] ?? c.status}</td>
                  <td>{day(c.paid_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <Pager path="/commissions" page={page} count={count} limit={LIMIT} extra={status ? `&status=${status}` : ""} />
    </Shell>
  )
}
