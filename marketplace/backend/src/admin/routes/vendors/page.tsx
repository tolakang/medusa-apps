import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Select, Table, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { errorText, STATUS_COLOR } from "../../lib/marketplace"
import { sdk } from "../../lib/sdk"

// Vendors (TASKS P6-07, BUILD_PLAN §6.6): the approval queue (pending first),
// approve / suspend / reactivate, and each vendor's commission rate. Reads
// GET /admin/vendors; writes POST /admin/vendors/:id (P6-03).

type Vendor = {
  id: string
  name: string
  handle: string
  email: string
  status: "pending" | "active" | "suspended"
  commission_rate: number | null
  created_at: string
  admins: { id: string; email: string; first_name: string | null; last_name: string | null }[]
}

const VendorsPage = () => {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState("pending")
  const [rates, setRates] = useState<Record<string, string>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ["marketplace-vendors", status],
    queryFn: () =>
      sdk.client.fetch<{ vendors: Vendor[]; count: number }>("/admin/vendors", {
        query: status === "all" ? {} : { status },
      }),
  })
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      sdk.client.fetch(`/admin/vendors/${id}`, { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["marketplace-vendors"] }),
  })

  return (
    <Container className="flex flex-col gap-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Heading>Vendors</Heading>
          <Text className="text-ui-fg-subtle">
            New vendors wait here until you approve them. Commission: empty = the marketplace
            default (MARKETPLACE_DEFAULT_COMMISSION_RATE).
          </Text>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <Select.Trigger className="w-44"><Select.Value /></Select.Trigger>
          <Select.Content>
            <Select.Item value="pending">Waiting for approval</Select.Item>
            <Select.Item value="active">Active</Select.Item>
            <Select.Item value="suspended">Suspended</Select.Item>
            <Select.Item value="all">All</Select.Item>
          </Select.Content>
        </Select>
      </div>
      {error && <Text className="text-ui-fg-error">{errorText(error)}</Text>}
      {update.error && <Text className="text-ui-fg-error">{errorText(update.error)}</Text>}
      {isLoading ? (
        <Text>Loading…</Text>
      ) : !data?.vendors.length ? (
        <Text className="text-ui-fg-subtle">No vendors here.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Vendor</Table.HeaderCell>
              <Table.HeaderCell>Sign-in</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Commission %</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.vendors.map((v) => (
              <Table.Row key={v.id}>
                <Table.Cell>
                  <div className="flex flex-col">
                    <Text size="small" weight="plus">{v.name}</Text>
                    <Text size="small" className="text-ui-fg-subtle">{v.handle} · {v.email}</Text>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{v.admins.map((a) => a.email).join(", ")}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={STATUS_COLOR[v.status]}>{v.status}</Badge>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-2">
                    <Input
                      size="small"
                      className="w-20"
                      placeholder="default"
                      value={rates[v.id] ?? (v.commission_rate === null ? "" : String(v.commission_rate))}
                      onChange={(e) => setRates((r) => ({ ...r, [v.id]: e.target.value }))}
                    />
                    {rates[v.id] !== undefined && (
                      <Button
                        size="small"
                        variant="secondary"
                        isLoading={update.isPending}
                        onClick={() =>
                          update.mutate({
                            id: v.id,
                            body: { commission_rate: rates[v.id].trim() === "" ? null : Number(rates[v.id]) },
                          })
                        }
                      >
                        Save
                      </Button>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell className="text-right">
                  {v.status !== "active" && (
                    <Button
                      size="small"
                      isLoading={update.isPending}
                      onClick={() => update.mutate({ id: v.id, body: { status: "active" } })}
                    >
                      {v.status === "pending" ? "Approve" : "Reactivate"}
                    </Button>
                  )}
                  {v.status !== "suspended" && (
                    <Button
                      size="small"
                      variant="danger"
                      className="ml-2"
                      isLoading={update.isPending}
                      onClick={() => update.mutate({ id: v.id, body: { status: "suspended" } })}
                    >
                      Suspend
                    </Button>
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
  label: "Vendors",
})

export default VendorsPage
