import PdfPrinter from "pdfmake";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { invoiceNumber } from "./terms";

// P4-06: the invoice PDF, after the official invoice tutorial (pdfmake,
// PDFKit's built-in Helvetica, A4). Pure: data in, PDF bytes out. The
// built-in fonts have no Khmer glyphs; embed a font file here if invoices
// need Khmer text.

export type InvoicePdfInput = {
  invoice: {
    display_id: number;
    company_name?: string | null;
    tax_id?: string | null;
    payment_terms?: string | null;
    issued_at: Date | string;
    due_at: Date | string;
  };
  order: {
    display_id?: number | null;
    email?: string | null;
    currency_code: string;
    subtotal?: number | null;
    shipping_total?: number | null;
    discount_total?: number | null;
    tax_total?: number | null;
    total: number;
    paid_total?: number;
    items: {
      title?: string | null;
      variant_sku?: string | null;
      quantity: number;
      unit_price: number;
      total?: number | null;
    }[];
    billing_address?: Address | null;
    shipping_address?: Address | null;
  };
  seller: InvoiceSeller;
};

type Address = {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
  country_code?: string | null;
} | null;

export type InvoiceSeller = {
  name: string;
  address?: string;
  tax_id?: string;
  email?: string;
  phone?: string;
  payment_note?: string;
};

/** The seller block, from env (`.env.example`, INVOICE_SELLER_*). */
export const sellerFromEnv = (env = process.env): InvoiceSeller => ({
  name: env.INVOICE_SELLER_NAME || "Wholesale",
  address: env.INVOICE_SELLER_ADDRESS?.replace(/\\n/g, "\n"),
  tax_id: env.INVOICE_SELLER_TAX_ID,
  email: env.INVOICE_SELLER_EMAIL,
  phone: env.INVOICE_SELLER_PHONE,
  payment_note: env.INVOICE_PAYMENT_NOTE?.replace(/\\n/g, "\n"),
});

const TERMS: Record<string, string> = {
  prepaid: "Prepaid",
  net_15: "Net 15",
  net_30: "Net 30",
  net_60: "Net 60",
};

const day = (value: Date | string) =>
  new Date(value).toISOString().slice(0, 10);

const addressLines = (address: Address) =>
  address
    ? [
        [address.first_name, address.last_name].filter(Boolean).join(" "),
        address.company,
        address.address_1,
        address.address_2,
        [address.postal_code, address.city].filter(Boolean).join(" "),
        [address.province, address.country_code?.toUpperCase()]
          .filter(Boolean)
          .join(", "),
      ].filter((line): line is string => !!line)
    : [];

export function buildInvoiceDocument(input: InvoicePdfInput): TDocumentDefinitions {
  const { invoice, order, seller } = input;
  const money = (amount?: number | null) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: order.currency_code.toUpperCase(),
    }).format(Number(amount ?? 0));
  const paid = Number(order.paid_total ?? 0);
  const due = Math.max(0, Number(order.total) - paid);

  const totals: [string, string][] = [
    ["Subtotal", money(order.subtotal)],
    ...(order.discount_total ? [["Discount", `-${money(order.discount_total)}`] as [string, string]] : []),
    ["Shipping", money(order.shipping_total)],
    ["Tax", money(order.tax_total)],
    ["Total", money(order.total)],
    ["Paid", money(paid)],
    ["Amount due", money(due)],
  ];

  const content: Content[] = [
    {
      columns: [
        [
          { text: seller.name, style: "seller" },
          ...[seller.address, seller.email, seller.phone]
            .filter(Boolean)
            .map((text) => ({ text: text as string })),
          ...(seller.tax_id ? [{ text: `Tax ID: ${seller.tax_id}` }] : []),
        ],
        {
          stack: [
            { text: "INVOICE", style: "title" },
            { text: invoiceNumber(invoice.display_id), bold: true },
            { text: `Order #${order.display_id ?? ""}` },
            { text: `Issued: ${day(invoice.issued_at)}` },
            { text: `Due: ${day(invoice.due_at)}` },
            { text: `Terms: ${TERMS[invoice.payment_terms ?? "prepaid"] ?? invoice.payment_terms}` },
            { text: due === 0 ? "PAID" : "UNPAID", bold: true, margin: [0, 4, 0, 0] },
          ],
          alignment: "right",
        },
      ],
    },
    {
      margin: [0, 24, 0, 12],
      columns: [
        [
          { text: "Bill to", style: "label" },
          ...(invoice.company_name ? [{ text: invoice.company_name, bold: true }] : []),
          ...(invoice.tax_id ? [{ text: `Tax ID: ${invoice.tax_id}` }] : []),
          ...addressLines(order.billing_address ?? order.shipping_address ?? null).map(
            (text) => ({ text })
          ),
          ...(order.email ? [{ text: order.email }] : []),
        ],
        [
          { text: "Ship to", style: "label" },
          ...addressLines(order.shipping_address ?? null).map((text) => ({ text })),
        ],
      ],
    },
    {
      table: {
        headerRows: 1,
        widths: ["*", "auto", "auto", "auto", "auto"],
        body: [
          ["Item", "SKU", "Qty", "Unit price", "Amount"].map((text) => ({
            text,
            style: "th",
          })),
          ...order.items.map((item) => [
            item.title ?? "",
            item.variant_sku ?? "",
            { text: String(item.quantity), alignment: "right" as const },
            { text: money(item.unit_price), alignment: "right" as const },
            {
              text: money(item.total ?? item.unit_price * item.quantity),
              alignment: "right" as const,
            },
          ]),
        ],
      },
      layout: "lightHorizontalLines",
    },
    {
      margin: [0, 12, 0, 0],
      table: {
        widths: ["*", "auto"],
        body: totals.map(([label, value], i) => [
          { text: label, alignment: "right", bold: i >= totals.length - 3 },
          { text: value, alignment: "right", bold: i >= totals.length - 3 },
        ]),
      },
      layout: "noBorders",
    },
    ...(seller.payment_note
      ? [{ text: seller.payment_note, margin: [0, 24, 0, 0] } as Content]
      : []),
  ];

  return {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 40],
    content,
    defaultStyle: { font: "Helvetica", fontSize: 10 },
    styles: {
      title: { fontSize: 18, bold: true },
      seller: { fontSize: 14, bold: true },
      label: { bold: true, color: "#666666", margin: [0, 0, 0, 2] },
      th: { bold: true },
    },
  };
}

const printer = new PdfPrinter({
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
});

export function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = printer.createPdfKitDocument(buildInvoiceDocument(input));
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
