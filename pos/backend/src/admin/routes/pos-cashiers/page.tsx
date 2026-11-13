import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import { inviteBody } from "../../lib/pos-setup"

// POS → Cashiers: invite cashiers and hand them their invite code, rename,
// (de)activate. Reads and writes /admin/pos/cashiers (P2-03, P2-06); owner
// request 2026-11-13 so staging Step 7.B needs no curl.

type Cashier = { id: string; name: string; email: string; is_active: boolean; invite_code: string }

const QUERY_KEY = ["pos-cashiers"]

const CashiersPage = () => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: "", email: "" })
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => sdk.client.fetch<{ cashiers: Cashier[] }>("/admin/pos/cashiers"),
  })
  const cashiers = data?.cashiers ?? []
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const invite = useMutation({
    mutationFn: (body: { name: string; email: string }) =>
      sdk.client.fetch<{ cashier: Cashier; invite_code: string }>("/admin/pos/cashiers", { method: "POST", body }),
    onSuccess: (result) => {
      setForm({ name: "", email: "" })
      refresh()
      toast.success(`${result.cashier.name} invited`, {
        description: `Invite code: ${result.invite_code}`,
        duration: 30000,
      })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; is_active?: boolean }) =>
      sdk.client.fetch<{ cashier: Cashier }>(`/admin/pos/cashiers/${id}`, { method: "POST", body }),
    onSuccess: (result) => {
      setEditing(null)
      refresh()
      toast.success(`${result.cashier.name} saved`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const body = inviteBody(form)

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Cashiers</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            At the till, the cashier picks "First time? Set your password" and enters their email, a new password and
            the invite code below. No email is sent.
          </Text>
        </div>
        <form
          className="flex flex-wrap items-end gap-3 px-6 py-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (body) invite.mutate(body)
          }}
        >
          <div className="flex flex-col gap-y-1">
            <Label size="small" htmlFor="cashier-name">
              Name
            </Label>
            <Input id="cashier-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small" htmlFor="cashier-email">
              Email
            </Label>
            <Input
              id="cashier-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <Button type="submit" size="small" disabled={!body} isLoading={invite.isPending}>
            Invite
          </Button>
        </form>
      </Container>

      <Container className="divide-y p-0">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Email</Table.HeaderCell>
              <Table.HeaderCell>Invite code</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {cashiers.map((c) => (
              <Table.Row key={c.id}>
                <Table.Cell>
                  {editing?.id === c.id ? (
                    <Input
                      size="small"
                      aria-label="New name"
                      value={editing.name}
                      onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                    />
                  ) : (
                    c.name
                  )}
                </Table.Cell>
                <Table.Cell>{c.email}</Table.Cell>
                <Table.Cell>
                  <span className="font-mono">{c.invite_code}</span>
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={c.is_active ? "green" : "grey"}>
                    {c.is_active ? "Active" : "Inactive"}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex justify-end gap-x-2">
                    {editing?.id === c.id ? (
                      <>
                        <Button
                          size="small"
                          disabled={!editing.name.trim()}
                          isLoading={update.isPending}
                          onClick={() => update.mutate({ id: c.id, name: editing.name.trim() })}
                        >
                          Save
                        </Button>
                        <Button size="small" variant="secondary" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="small" variant="secondary" onClick={() => setEditing({ id: c.id, name: c.name })}>
                          Rename
                        </Button>
                        <Button
                          size="small"
                          variant="secondary"
                          disabled={update.isPending}
                          onClick={() => update.mutate({ id: c.id, is_active: !c.is_active })}
                        >
                          {c.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        {!isLoading && !cashiers.length && (
          <Text size="small" className="text-ui-fg-subtle px-6 py-4">
            {error ? `Couldn't load the cashiers: ${(error as Error).message}` : "No cashiers yet. Invite one above."}
          </Text>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Cashiers",
})

export default CashiersPage
