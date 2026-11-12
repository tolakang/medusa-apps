import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Select, Table, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { adminLink, errorText, money, STATUS_COLOR } from "../../lib/marketplace"
import { sdk } from "../../lib/sdk"

// Vendor payouts (TASKS P6-07, BUILD_PLAN §6.6): the manual payout report.
// Each month's job makes one payout per vendor and currency (P6-06); pay it
// outside Medusa, then record the transfer's reference here. Reads
// GET /admin/vendor-payouts[/:id]; writes POST /admin/vendor-payouts/:id/pay.

type Payout = {
  id: string
  amount: number
  currency_code: string
  period: string
  status: string
  paid_at: string | null
  reference: string | null
  vendor: { id: string; name: string }
}
type Commission = {
  id: string
  order_id: string
  order_total: number
  rate: number
  amount: number
  payout_amount: number
  currency_code: string
  status: string
}

const PayoutDetail = ({ id }: { id: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["marketplace-vendor-payout", id],
    queryFn: () =>
      sdk.client.fetch<{ vendor_payout: Payout & { commissions: Commission[] } }>(
        `/admin/vendor-payouts/${id}`
      ),
  })
  if (isLoading || !data) {
    return <Text size="small">Loading…</Text>
  }
  return (
    <div className="flex flex-col gap-y-1 py-2">
      {data.vendor_payout.commissions.map((c) => (
        <Text size="small" key={c.id}>
          <a href={adminLink(`/orders/${c.order_id}`)} className="text-ui-fg-interactive hover:underline">
            Order
          </a>{" "}
          total {money(c.order_total, c.currency_code)} − commission {money(c.amount, c.currency_code)} ({c.rate}%)
          = {money(c.payout_amount, c.currency_code)}
        </Text>
      ))}
    </div>
  )
}

const VendorPayoutsPage = () => {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState("pending")
  const [open, setOpen] = useState<string | null>(null)
  const [references, setReferences] = useState<Record<string, string>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ["marketplace-vendor-payouts", status],
    queryFn: () =>
      sdk.client.fetch<{ vendor_payouts: Payout[] }>("/admin/vendor-payouts", {
        query: status === "all" ? {} : { status },
      }),
  })
  const pay = useMutation({
    mutationFn: ({ id, reference }: { id: string; reference: string }) =>
      sdk.client.fetch(`/admin/vendor-payouts/${id}/pay`, { method: "POST", body: { reference } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["marketplace-vendor-payouts"] }),
  })

  return (
    <Container className="flex flex-col gap-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Heading>Vendor payouts</Heading>
          <Text className="text-ui-fg-subtle">
            Made on MARKETPLACE_PAYOUT_DAY for the month before: each vendor's order totals minus
            commission. Pay outside Medusa, then record the reference.
          </Text>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <Select.Trigger className="w-36"><Select.Value /></Select.Trigger>
          <Select.Content>
            <Select.Item value="pending">To pay</Select.Item>
            <Select.Item value="paid">Paid</Select.Item>
            <Select.Item value="all">All</Select.Item>
          </Select.Content>
        </Select>
      </div>
      {error && <Text className="text-ui-fg-error">{errorText(error)}</Text>}
      {pay.error && <Text className="text-ui-fg-error">{errorText(pay.error)}</Text>}
      {isLoading ? (
        <Text>Loading…</Text>
      ) : !data?.vendor_payouts.length ? (
        <Text className="text-ui-fg-subtle">No payouts here.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Vendor</Table.HeaderCell>
              <Table.HeaderCell>Month</Table.HeaderCell>
              <Table.HeaderCell>Amount</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.vendor_payouts.map((p) => (
              <Table.Row key={p.id}>
                <Table.Cell>
                  <button className="text-ui-fg-interactive hover:underline" onClick={() => setOpen(open === p.id ? null : p.id)}>
                    {p.vendor.name}
                  </button>
                  {open === p.id && <PayoutDetail id={p.id} />}
                </Table.Cell>
                <Table.Cell>{p.period}</Table.Cell>
                <Table.Cell>{money(p.amount, p.currency_code)}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={STATUS_COLOR[p.status]}>{p.status}</Badge>
                  {p.reference && <Text size="small" className="text-ui-fg-subtle">{p.reference}</Text>}
                </Table.Cell>
                <Table.Cell className="text-right">
                  {p.status === "pending" && (
                    <div className="flex items-center justify-end gap-2">
                      <Input
                        size="small"
                        className="w-40"
                        placeholder="Transfer reference"
                        value={references[p.id] ?? ""}
                        onChange={(e) => setReferences((r) => ({ ...r, [p.id]: e.target.value }))}
                      />
                      <Button
                        size="small"
                        disabled={!references[p.id]?.trim()}
                        isLoading={pay.isPending}
                        onClick={() => pay.mutate({ id: p.id, reference: references[p.id].trim() })}
                      >
                        Mark paid
                      </Button>
                    </div>
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
  label: "Vendor payouts",
})

export default VendorPayoutsPage
