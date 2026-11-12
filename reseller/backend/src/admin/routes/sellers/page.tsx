import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Table, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"

// Sellers (TASKS F-081, BUILD_PLAN §6.5): invite a seller, give them their
// invite code, activate or suspend them, and set their domain and commission
// rate. Reads GET /admin/sellers; writes POST /admin/sellers (P5-03) and
// POST /admin/sellers/:id (F-081).

type Status = "pending" | "active" | "suspended"

type Seller = {
  id: string
  handle: string
  name: string
  email: string
  domain: string | null
  status: Status
  commission_rate: number | null
  created_at: string
  invite_code: string
}

type Draft = { domain?: string; rate?: string }

const STATUS_COLOR: Record<Status, "green" | "orange" | "red"> = {
  active: "green",
  pending: "orange",
  suspended: "red",
}
const STATUS_ORDER: Record<Status, number> = { pending: 0, active: 1, suspended: 2 }

const errorText = (e: unknown) =>
  (e as { message?: string })?.message ?? "Something went wrong."

/** "" = none (domain) or the shop's default (rate). */
const changes = (seller: Seller, draft: Draft) => {
  const body: Record<string, unknown> = {}
  if (draft.domain !== undefined) {
    const domain = draft.domain.trim().toLowerCase()
    body.domain = domain === "" ? null : domain
  }
  if (draft.rate !== undefined) {
    const rate = draft.rate.trim()
    body.commission_rate = rate === "" ? null : Number(rate)
  }
  if (body.domain === seller.domain) delete body.domain
  if (body.commission_rate === seller.commission_rate) delete body.commission_rate
  return body
}

const EMPTY_INVITE = { name: "", handle: "", email: "", domain: "", rate: "" }

const SellersPage = () => {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [invite, setInvite] = useState(EMPTY_INVITE)
  const [invited, setInvited] = useState<{ name: string; code: string } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ["reseller-sellers"],
    queryFn: () =>
      sdk.client.fetch<{ sellers: Seller[]; count: number }>("/admin/sellers"),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["reseller-sellers"] })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      sdk.client.fetch(`/admin/sellers/${id}`, { method: "POST", body }),
    onSuccess: (_, { id }) => {
      setDrafts((d) => {
        const { [id]: _done, ...rest } = d
        return rest
      })
      refresh()
    },
  })

  const create = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ seller: Seller; invite_code: string }>("/admin/sellers", {
        method: "POST",
        body: {
          name: invite.name.trim(),
          handle: invite.handle.trim(),
          email: invite.email.trim(),
          domain: invite.domain.trim() === "" ? null : invite.domain.trim().toLowerCase(),
          commission_rate: invite.rate.trim() === "" ? null : Number(invite.rate),
          status: "active",
        },
      }),
    onSuccess: ({ seller, invite_code }) => {
      setInvited({ name: seller.name, code: invite_code })
      setInvite(EMPTY_INVITE)
      refresh()
    },
  })

  const sellers = [...(data?.sellers ?? [])].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name)
  )
  const setDraft = (id: string, patch: Draft) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-col gap-y-4">
        <div>
          <Heading>Invite a seller</Heading>
          <Text className="text-ui-fg-subtle">
            The seller is active at once. Give them the invite code: they set their password with
            it in the seller portal. Domain: the host of their shop, such as shop.example.com (add
            it to STORE_CORS too). Commission: empty = the shop's default
            (RESELLER_DEFAULT_COMMISSION_RATE).
          </Text>
        </div>
        <form
          className="grid grid-cols-1 gap-2 md:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault()
            setInvited(null)
            create.mutate()
          }}
        >
          <Input
            size="small"
            placeholder="Name"
            value={invite.name}
            onChange={(e) => setInvite((i) => ({ ...i, name: e.target.value }))}
          />
          <Input
            size="small"
            placeholder="handle (e.g. lina-shop)"
            value={invite.handle}
            onChange={(e) => setInvite((i) => ({ ...i, handle: e.target.value }))}
          />
          <Input
            size="small"
            type="email"
            placeholder="Email (their sign-in)"
            value={invite.email}
            onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
          />
          <Input
            size="small"
            placeholder="Domain (optional)"
            value={invite.domain}
            onChange={(e) => setInvite((i) => ({ ...i, domain: e.target.value }))}
          />
          <Input
            size="small"
            placeholder="Commission % (default)"
            value={invite.rate}
            onChange={(e) => setInvite((i) => ({ ...i, rate: e.target.value }))}
          />
          <Button
            size="small"
            type="submit"
            disabled={!invite.name.trim() || !invite.handle.trim() || !invite.email.trim()}
            isLoading={create.isPending}
          >
            Invite
          </Button>
        </form>
        {create.error && <Text className="text-ui-fg-error">{errorText(create.error)}</Text>}
        {invited && (
          <Text>
            {invited.name} is invited. Invite code:{" "}
            <span className="font-mono font-semibold">{invited.code}</span>
          </Text>
        )}
      </Container>

      <Container className="flex flex-col gap-y-4">
        <div>
          <Heading>Sellers</Heading>
          <Text className="text-ui-fg-subtle">
            Only an active seller's domain shows their shop, and only their orders earn a
            commission. Suspending signs the seller out at once. A new rate applies to new orders.
          </Text>
        </div>
        {error && <Text className="text-ui-fg-error">{errorText(error)}</Text>}
        {update.error && <Text className="text-ui-fg-error">{errorText(update.error)}</Text>}
        {isLoading ? (
          <Text>Loading…</Text>
        ) : !sellers.length ? (
          <Text className="text-ui-fg-subtle">No sellers yet.</Text>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Seller</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Domain</Table.HeaderCell>
                <Table.HeaderCell>Commission %</Table.HeaderCell>
                <Table.HeaderCell>Invite code</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {sellers.map((s) => {
                const draft = drafts[s.id] ?? {}
                const body = changes(s, draft)
                const busy = update.isPending && update.variables?.id === s.id
                return (
                  <Table.Row key={s.id}>
                    <Table.Cell>
                      <div className="flex flex-col">
                        <Text size="small" weight="plus">{s.name}</Text>
                        <Text size="small" className="text-ui-fg-subtle">
                          {s.handle} · {s.email}
                        </Text>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge size="2xsmall" color={STATUS_COLOR[s.status]}>{s.status}</Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Input
                        size="small"
                        className="w-48"
                        placeholder="none"
                        value={draft.domain ?? s.domain ?? ""}
                        onChange={(e) => setDraft(s.id, { domain: e.target.value })}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-2">
                        <Input
                          size="small"
                          className="w-20"
                          placeholder="default"
                          value={draft.rate ?? (s.commission_rate === null ? "" : String(s.commission_rate))}
                          onChange={(e) => setDraft(s.id, { rate: e.target.value })}
                        />
                        {Object.keys(body).length > 0 && (
                          <Button
                            size="small"
                            variant="secondary"
                            isLoading={busy}
                            onClick={() => update.mutate({ id: s.id, body })}
                          >
                            Save
                          </Button>
                        )}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small" className="font-mono">{s.invite_code}</Text>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {s.status !== "active" && (
                        <Button
                          size="small"
                          isLoading={busy}
                          onClick={() => update.mutate({ id: s.id, body: { status: "active" } })}
                        >
                          {s.status === "pending" ? "Activate" : "Reactivate"}
                        </Button>
                      )}
                      {s.status !== "suspended" && (
                        <Button
                          size="small"
                          variant="danger"
                          className="ml-2"
                          isLoading={busy}
                          onClick={() => update.mutate({ id: s.id, body: { status: "suspended" } })}
                        >
                          Suspend
                        </Button>
                      )}
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Sellers",
})

export default SellersPage
