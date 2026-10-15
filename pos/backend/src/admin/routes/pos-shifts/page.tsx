import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Container, Heading, Input, Label, Select, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { sdk } from "../../lib/sdk"
import {
  dateRange,
  formatMoney,
  formatVariance,
  groupShifts,
  type GroupBy,
  type ReportShift,
} from "../../lib/shift-report"

// POS → Shift report (TASKS P2-07, BUILD_PLAN §6.2): shifts per register,
// cashier and day, with expected cash, counted cash and the variance. Reads
// GET /admin/pos/shifts (P2-06); the summary groups the loaded shifts, up to
// REPORT_LIMIT, newest first.

const REPORT_LIMIT = 200
const PAGE_SIZE = 20
const ALL = "all"

type Option = { id: string; name: string }

const varianceColor = (v: number | null) => (v === null ? "grey" : v === 0 ? "green" : v < 0 ? "red" : "orange")

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "–"

const ShiftReportPage = () => {
  const [registerId, setRegisterId] = useState(ALL)
  const [cashierId, setCashierId] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [groupBy, setGroupBy] = useState<GroupBy>("day")
  const [page, setPage] = useState(0)

  const { data: registers } = useQuery({
    queryKey: ["pos-registers"],
    queryFn: () => sdk.client.fetch<{ registers: Option[] }>("/admin/pos/registers"),
  })
  const { data: cashiers } = useQuery({
    queryKey: ["pos-cashiers"],
    queryFn: () => sdk.client.fetch<{ cashiers: Option[] }>("/admin/pos/cashiers"),
  })

  const params = useMemo(() => {
    const query: Record<string, string | number> = { limit: REPORT_LIMIT, ...dateRange(from, to) }
    if (registerId !== ALL) query.register_id = registerId
    if (cashierId !== ALL) query.cashier_id = cashierId
    if (status !== ALL) query.status = status
    return query
  }, [registerId, cashierId, status, from, to])

  const { data, isLoading, error } = useQuery({
    queryKey: ["pos-shifts", params],
    queryFn: () => sdk.client.fetch<{ shifts: ReportShift[]; count: number }>("/admin/pos/shifts", { query: params }),
  })
  const shifts = data?.shifts ?? []
  const groups = useMemo(() => groupShifts(shifts, groupBy), [shifts, groupBy])
  const pageCount = Math.max(1, Math.ceil(shifts.length / PAGE_SIZE))
  const visible = shifts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Any filter change starts the list from its first page.
  const filter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v)
      setPage(0)
    }

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading level="h1">Shift report</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Cash expected and counted at each register. A negative variance means cash is missing.
            </Text>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 px-6 py-4 md:grid-cols-5">
          <div className="flex flex-col gap-y-1">
            <Label size="small">Register</Label>
            <Select value={registerId} onValueChange={filter(setRegisterId)}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={ALL}>All registers</Select.Item>
                {(registers?.registers ?? []).map((r) => (
                  <Select.Item key={r.id} value={r.id}>
                    {r.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small">Cashier</Label>
            <Select value={cashierId} onValueChange={filter(setCashierId)}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={ALL}>All cashiers</Select.Item>
                {(cashiers?.cashiers ?? []).map((c) => (
                  <Select.Item key={c.id} value={c.id}>
                    {c.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small">Status</Label>
            <Select value={status} onValueChange={filter(setStatus)}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={ALL}>All</Select.Item>
                <Select.Item value="open">Open</Select.Item>
                <Select.Item value="closed">Closed</Select.Item>
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small" htmlFor="shift-from">
              From
            </Label>
            <Input id="shift-from" type="date" value={from} onChange={(e) => filter(setFrom)(e.target.value)} />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="small" htmlFor="shift-to">
              To
            </Label>
            <Input id="shift-to" type="date" value={to} onChange={(e) => filter(setTo)(e.target.value)} />
          </div>
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">Summary</Heading>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <Select.Trigger className="w-40">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="day">Per day</Select.Item>
              <Select.Item value="register">Per register</Select.Item>
              <Select.Item value="cashier">Per cashier</Select.Item>
            </Select.Content>
          </Select>
        </div>
        {data && data.count > shifts.length && (
          <Text size="small" className="text-ui-fg-subtle px-6 py-2">
            Showing the latest {shifts.length} of {data.count} shifts. Narrow the dates to see older ones.
          </Text>
        )}
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{groupBy === "day" ? "Day" : groupBy === "register" ? "Register" : "Cashier"}</Table.HeaderCell>
              <Table.HeaderCell>Shifts</Table.HeaderCell>
              <Table.HeaderCell>Expected</Table.HeaderCell>
              <Table.HeaderCell>Counted</Table.HeaderCell>
              <Table.HeaderCell>Variance</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {groups.map((g) => (
              <Table.Row key={`${g.key}|${g.currency_code}`}>
                <Table.Cell>
                  {g.label} <span className="text-ui-fg-muted">{g.currency_code.toUpperCase()}</span>
                </Table.Cell>
                <Table.Cell>
                  {g.shifts}
                  {g.open > 0 && <span className="text-ui-fg-muted"> ({g.open} open)</span>}
                  {g.mismatched > 0 && <span className="text-ui-fg-error"> · {g.mismatched} off</span>}
                </Table.Cell>
                <Table.Cell>{formatMoney(g.expected, g.currency_code)}</Table.Cell>
                <Table.Cell>{formatMoney(g.counted, g.currency_code)}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={varianceColor(g.variance)}>
                    {formatVariance(g.variance, g.currency_code)}
                  </Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        {!isLoading && !groups.length && (
          <Text size="small" className="text-ui-fg-subtle px-6 py-4">
            {error ? `Couldn't load the shifts: ${(error as Error).message}` : "No shifts match these filters."}
          </Text>
        )}
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Shifts</Heading>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Opened</Table.HeaderCell>
              <Table.HeaderCell>Register</Table.HeaderCell>
              <Table.HeaderCell>Cashier</Table.HeaderCell>
              <Table.HeaderCell>Opening</Table.HeaderCell>
              <Table.HeaderCell>Expected</Table.HeaderCell>
              <Table.HeaderCell>Counted</Table.HeaderCell>
              <Table.HeaderCell>Variance</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {visible.map((s) => (
              <Table.Row key={s.id} title={s.notes ?? undefined}>
                <Table.Cell>
                  {when(s.opened_at)}
                  {s.status === "open" ? (
                    <Badge size="2xsmall" color="blue" className="ml-2">
                      Open
                    </Badge>
                  ) : (
                    <div className="text-ui-fg-muted txt-small">Closed {when(s.closed_at)}</div>
                  )}
                </Table.Cell>
                <Table.Cell>{s.register?.name ?? "–"}</Table.Cell>
                <Table.Cell>
                  {s.opened_by_name ?? s.opened_by}
                  {s.closed_by_name && s.closed_by_name !== s.opened_by_name && (
                    <div className="text-ui-fg-muted txt-small">closed by {s.closed_by_name}</div>
                  )}
                </Table.Cell>
                <Table.Cell>{formatMoney(s.opening_cash, s.currency_code)}</Table.Cell>
                <Table.Cell>{formatMoney(s.expected_cash, s.currency_code)}</Table.Cell>
                <Table.Cell>{formatMoney(s.counted_cash, s.currency_code)}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={varianceColor(s.variance)}>
                    {formatVariance(s.variance, s.currency_code)}
                  </Badge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        <Table.Pagination
          count={shifts.length}
          pageSize={PAGE_SIZE}
          pageIndex={page}
          pageCount={pageCount}
          canPreviousPage={page > 0}
          canNextPage={page + 1 < pageCount}
          previousPage={() => setPage((p) => Math.max(0, p - 1))}
          nextPage={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
        />
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Shift report",
})

export default ShiftReportPage
