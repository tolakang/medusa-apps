import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Select, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import { registerBody, type RegisterForm } from "../../lib/pos-setup"

// POS → Registers: add a register with its stock location and sales channel,
// (de)activate it. Reads and writes /admin/pos/registers (P2-06); owner
// request 2026-11-13 so staging Step 7.B needs no curl.

type Named = { id: string; name: string }
type Register = {
  id: string
  name: string
  code: string
  is_active: boolean
  stock_location: Named | null
  sales_channel: Named | null
}

const QUERY_KEY = ["pos-registers"]
const EMPTY: RegisterForm = { name: "", code: "", stock_location_id: "", sales_channel_id: "" }
const LIST_LIMIT = 100

const RegistersPage = () => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<RegisterForm>(EMPTY)

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => sdk.client.fetch<{ registers: Register[] }>("/admin/pos/registers"),
  })
  const { data: locations } = useQuery({
    queryKey: ["pos-registers", "stock-locations"],
    queryFn: () => sdk.admin.stockLocation.list({ limit: LIST_LIMIT, fields: "id,name" }),
  })
  const { data: channels } = useQuery({
    queryKey: ["pos-registers", "sales-channels"],
    queryFn: () => sdk.admin.salesChannel.list({ limit: LIST_LIMIT, fields: "id,name" }),
  })
  const registers = data?.registers ?? []
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const add = useMutation({
    mutationFn: (body: RegisterForm) =>
      sdk.client.fetch<{ register: Register }>("/admin/pos/registers", { method: "POST", body }),
    onSuccess: (result) => {
      setForm(EMPTY)
      refresh()
      toast.success(`Register ${result.register.name} added`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      sdk.client.fetch<{ register: Register }>(`/admin/pos/registers/${id}`, { method: "POST", body: { is_active } }),
    onSuccess: () => {
      refresh()
      toast.success("Register saved")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const body = registerBody(form)

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Registers</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Each till sells the stock of one location through one sales channel.
          </Text>
        </div>
        <form
          className="grid grid-cols-1 items-end gap-3 px-6 py-4 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (body) add.mutate(body)
          }}
        >
          <div className="flex flex-col gap-y-1">
            <Label size="small" htmlFor="register-name">
              Name
            </Label>
            <Input id="register-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small" htmlFor="register-code">
              Code
            </Label>
            <Input id="register-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small">Stock location</Label>
            <Select value={form.stock_location_id} onValueChange={(v) => setForm({ ...form, stock_location_id: v })}>
              <Select.Trigger>
                <Select.Value placeholder="Choose" />
              </Select.Trigger>
              <Select.Content>
                {(locations?.stock_locations ?? []).map((l) => (
                  <Select.Item key={l.id} value={l.id}>
                    {l.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small">Sales channel</Label>
            <Select value={form.sales_channel_id} onValueChange={(v) => setForm({ ...form, sales_channel_id: v })}>
              <Select.Trigger>
                <Select.Value placeholder="Choose" />
              </Select.Trigger>
              <Select.Content>
                {(channels?.sales_channels ?? []).map((c) => (
                  <Select.Item key={c.id} value={c.id}>
                    {c.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <Button type="submit" size="small" disabled={!body} isLoading={add.isPending}>
            Add register
          </Button>
        </form>
      </Container>

      <Container className="divide-y p-0">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Code</Table.HeaderCell>
              <Table.HeaderCell>Stock location</Table.HeaderCell>
              <Table.HeaderCell>Sales channel</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {registers.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>{r.name}</Table.Cell>
                <Table.Cell>
                  <span className="font-mono">{r.code}</span>
                </Table.Cell>
                <Table.Cell>{r.stock_location?.name ?? "–"}</Table.Cell>
                <Table.Cell>{r.sales_channel?.name ?? "–"}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={r.is_active ? "green" : "grey"}>
                    {r.is_active ? "Active" : "Inactive"}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex justify-end">
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ id: r.id, is_active: !r.is_active })}
                    >
                      {r.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        {!isLoading && !registers.length && (
          <Text size="small" className="text-ui-fg-subtle px-6 py-4">
            {error ? `Couldn't load the registers: ${(error as Error).message}` : "No registers yet. Add one above."}
          </Text>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Registers",
})

export default RegistersPage
