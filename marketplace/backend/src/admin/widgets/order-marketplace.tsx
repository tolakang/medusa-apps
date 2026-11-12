import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { adminLink, money } from "../lib/marketplace"
import { sdk } from "../lib/sdk"

// Marketplace split on the order page (TASKS P6-07): a parent order lists its
// vendor child orders; a child order shows its vendor and parent. Reads
// GET /admin/orders/:id/marketplace. Same zone as the Telegram widget.

type Split =
  | { kind: "plain" }
  | {
      kind: "child"
      vendor: { id: string; name: string } | null
      parent_order: { id: string; display_id: number } | null
    }
  | {
      kind: "parent"
      child_orders: {
        id: string
        display_id: number
        total: number
        currency_code: string
        status: string
        vendor: { name: string } | null
      }[]
    }

const OrderMarketplaceWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const { data } = useQuery({
    queryKey: ["marketplace-order-split", order.id],
    queryFn: () => sdk.client.fetch<Split>(`/admin/orders/${order.id}/marketplace`),
  })
  if (!data || data.kind === "plain") {
    return null
  }
  return (
    <Container className="px-6 py-4">
      {data.kind === "child" ? (
        <>
          <Heading level="h2" className="mb-2">Vendor order</Heading>
          <Text size="small">Vendor: {data.vendor?.name ?? "—"}</Text>
          {data.parent_order && (
            <Text size="small">
              Customer's order:{" "}
              <a href={adminLink(`/orders/${data.parent_order.id}`)} className="text-ui-fg-interactive hover:underline">
                #{data.parent_order.display_id}
              </a>{" "}
              (payment is there)
            </Text>
          )}
        </>
      ) : (
        <>
          <Heading level="h2" className="mb-2">Vendor orders</Heading>
          <Text size="small" className="text-ui-fg-subtle mb-1">
            Vendors fulfil these; this order holds the payment.
          </Text>
          {data.child_orders.map((c) => (
            <Text size="small" key={c.id}>
              <a href={adminLink(`/orders/${c.id}`)} className="text-ui-fg-interactive hover:underline">
                #{c.display_id}
              </a>{" "}
              {c.vendor?.name ?? ""} · {money(c.total, c.currency_code)} · {c.status.replace(/_/g, " ")}
            </Text>
          ))}
        </>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderMarketplaceWidget
