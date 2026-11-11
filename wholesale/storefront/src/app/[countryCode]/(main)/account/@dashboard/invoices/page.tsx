import { listInvoices } from "@/lib/data/invoices"
import { convertToLocale } from "@/lib/util/money"
import LocalizedClientLink from "@/modules/common/components/localized-client-link"
import { Container, Heading, Text } from "@medusajs/ui"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Invoices",
  description: "Your company's invoices and what is due.",
}

const TERMS: Record<string, string> = {
  prepaid: "Prepaid",
  net_15: "Net 15",
  net_30: "Net 30",
  net_60: "Net 60",
}

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "-"

export default async function Invoices() {
  const invoices = await listInvoices()
  const money = (amount: number, currency: string | null) =>
    convertToLocale({ amount, currency_code: currency ?? "usd" })

  return (
    <div className="w-full" data-testid="invoices-page-wrapper">
      <div className="mb-4">
        <Heading>Invoices</Heading>
      </div>

      {!invoices.length ? (
        <Container>
          <Text className="text-neutral-700">
            No invoices yet. Each order gets one when it is placed.
          </Text>
        </Container>
      ) : (
        <Container className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-200">
                <th className="p-4 font-normal">Invoice</th>
                <th className="p-4 font-normal">Order</th>
                <th className="p-4 font-normal">Issued</th>
                <th className="p-4 font-normal">Due</th>
                <th className="p-4 font-normal">Terms</th>
                <th className="p-4 font-normal text-right">Total</th>
                <th className="p-4 font-normal text-right">Amount due</th>
                <th className="p-4 font-normal" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b border-neutral-200 last:border-b-0"
                  data-testid="invoice-row"
                >
                  <td className="p-4 text-neutral-950">{invoice.number}</td>
                  <td className="p-4">
                    <LocalizedClientLink
                      href={`/account/orders/details/${invoice.order_id}`}
                      className="text-neutral-950 hover:underline"
                    >
                      #{invoice.order_display_id ?? "-"}
                    </LocalizedClientLink>
                  </td>
                  <td className="p-4">{date(invoice.issued_at)}</td>
                  <td className="p-4">{date(invoice.due_at)}</td>
                  <td className="p-4">
                    {TERMS[invoice.payment_terms ?? ""] ?? "-"}
                  </td>
                  <td className="p-4 text-right">
                    {money(invoice.total, invoice.currency_code)}
                  </td>
                  <td className="p-4 text-right text-neutral-950">
                    {invoice.amount_due > 0
                      ? money(invoice.amount_due, invoice.currency_code)
                      : "Paid"}
                  </td>
                  <td className="p-4 text-right">
                    <a
                      href={`/api/invoices/${invoice.order_id}`}
                      className="text-neutral-950 underline"
                      data-testid="invoice-pdf-link"
                    >
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Container>
      )}
    </div>
  )
}
