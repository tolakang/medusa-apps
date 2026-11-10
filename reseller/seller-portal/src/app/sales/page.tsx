import { Pager, Shell } from "@/components/shell"
import { day, money, pageFrom } from "@/lib/format"
import { requireSeller, sellerGet } from "@/lib/server/seller"

type Order = {
  id: string
  display_id: number
  created_at: string
  status: string
  currency_code: string
  total: number
  items: { title: string; quantity: number }[]
  commission: { amount: number; status: string } | null
}

const LIMIT = 20

// TASKS P5-08: orders placed in your shop. The shop ships them.
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { token, seller } = await requireSeller()
  const page = pageFrom((await searchParams).page)
  const { orders, count } = await sellerGet<{ orders: Order[]; count: number }>(
    token,
    "/sellers/me/orders",
    { limit: String(LIMIT), offset: String((page - 1) * LIMIT) }
  )
  return (
    <Shell seller={seller} active="/sales">
      <section className="card overflow-x-auto p-4">
        {orders.length === 0 ? (
          <p className="text-sm text-ui-fg-subtle">No orders in your shop yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Items</th>
                <th>Status</th>
                <th>Total</th>
                <th>Your commission</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>#{order.display_id}</td>
                  <td>{day(order.created_at)}</td>
                  <td>{order.items.map((item) => `${item.quantity} × ${item.title}`).join(", ")}</td>
                  <td>{order.status}</td>
                  <td>{money(order.total, order.currency_code)}</td>
                  <td>
                    {order.commission
                      ? `${money(order.commission.amount, order.currency_code)} (${order.commission.status})`
                      : "None"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <Pager path="/sales" page={page} count={count} limit={LIMIT} />
    </Shell>
  )
}
