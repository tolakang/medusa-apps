import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { adminLink, errorText, money, STATUS_COLOR } from "../../lib/marketplace"
import { sdk } from "../../lib/sdk"

// Vendor orders (TASKS P6-07, BUILD_PLAN §6.6): the child orders vendors
// fulfil, which reports count. Medusa's own Orders list shows the
// customers' parent orders (they hold the payment) and these together.
// Reads GET /admin/vendor-orders.

type VendorOrder = {
  id: string
  display_id: number
  status: string
  total: number
  currency_code: string
  created_at: string
  parent_order_id: string | null
  vendor: { id: string; name: string }
}

const VendorOrdersPage = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["marketplace-vendor-orders"],
    queryFn: () => sdk.client.fetch<{ orders: VendorOrder[] }>("/admin/vendor-orders"),
  })

  return (
    <Container className="flex flex-col gap-y-4">
      <div>
        <Heading>Vendor orders</Heading>
        <Text className="text-ui-fg-subtle">
          One per vendor per checkout. The customer's payment is on the parent order.
        </Text>
      </div>
      {error && <Text className="text-ui-fg-error">{errorText(error)}</Text>}
      {isLoading ? (
        <Text>Loading…</Text>
      ) : !data?.orders.length ? (
        <Text className="text-ui-fg-subtle">No vendor orders yet.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Order</Table.HeaderCell>
              <Table.HeaderCell>Vendor</Table.HeaderCell>
              <Table.HeaderCell>Total</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Parent</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.orders.map((o) => (
              <Table.Row key={o.id}>
                <Table.Cell>
                  <a href={adminLink(`/orders/${o.id}`)} className="text-ui-fg-interactive hover:underline">
                    #{o.display_id}
                  </a>
                </Table.Cell>
                <Table.Cell>{o.vendor.name}</Table.Cell>
                <Table.Cell>{money(o.total, o.currency_code)}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={STATUS_COLOR[o.status] ?? "grey"}>
                    {o.status.replace(/_/g, " ")}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {o.parent_order_id && (
                    <a href={adminLink(`/orders/${o.parent_order_id}`)} className="text-ui-fg-interactive hover:underline">
                      Parent
                    </a>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vendor orders",
})

export default VendorOrdersPage
