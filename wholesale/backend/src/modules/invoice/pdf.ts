import PdfPrinter from "pdfmake";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { invoiceNumber } from "./terms";

// P4-06: the invoice PDF, after the official invoice tutorial (pdfmake, A4).
// Pure: data in, PDF bytes out.
//
// P4-13 (owner D10): every label is in English and Khmer. The font is
// Kantumruy Pro (SIL Open Font License, npm @fontsource/kantumruy-pro), which
// has Khmer and Latin glyphs, so item names in either script print too.
// Checked by rendering: stacked consonants, the subscript ro and pre-base
// vowels come out right. Noto Sans Khmer and Noto Serif Khmer crash pdfmake's
// font engine (fontkit: a null GPOS anchor), so they aren't used.

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

// Labels in English and Khmer (D10). Have a Khmer-speaking colleague read
// them once before going live.
const L = {
  invoice: ["INVOICE", "វិក្កយបត្រ"],
  order: ["Order", "ការបញ្ជាទិញ"],
  issued: ["Issued", "ថ្ងៃចេញ"],
  due: ["Due", "ថ្ងៃផុតកំណត់"],
  terms: ["Terms", "លក្ខខណ្ឌទូទាត់"],
  paid_stamp: ["PAID", "បានបង់"],
  unpaid_stamp: ["UNPAID", "មិនទាន់បង់"],
  bill_to: ["Bill to", "អតិថិជន"],
  ship_to: ["Ship to", "ដឹកជញ្ជូនទៅ"],
  tax_id: ["Tax ID", "លេខអត្តសញ្ញាណកម្មសារពើពន្ធ"],
  item: ["Item", "ទំនិញ"],
  sku: ["SKU", "កូដ"],
  qty: ["Qty", "ចំនួន"],
  unit_price: ["Unit price", "តម្លៃឯកតា"],
  amount: ["Amount", "ទឹកប្រាក់"],
  subtotal: ["Subtotal", "សរុបរង"],
  discount: ["Discount", "បញ្ចុះតម្លៃ"],
  shipping: ["Shipping", "ថ្លៃដឹកជញ្ជូន"],
  tax: ["Tax", "ពន្ធ"],
  total: ["Total", "សរុប"],
  paid: ["Paid", "បានបង់"],
  amount_due: ["Amount due", "ទឹកប្រាក់ត្រូវបង់"],
} as const;

/** "English / ខ្មែរ" */
export const label = (key: keyof typeof L) => `${L[key][0]} / ${L[key][1]}`;

const TERMS: Record<string, [string, string]> = {
  prepaid: ["Prepaid", "បង់ប្រាក់មុន"],
  net_15: ["Net 15", "ទូទាត់ក្នុងរយៈពេល ១៥ ថ្ងៃ"],
  net_30: ["Net 30", "ទូទាត់ក្នុងរយៈពេល ៣០ ថ្ងៃ"],
  net_60: ["Net 60", "ទូទាត់ក្នុងរយៈពេល ៦០ ថ្ងៃ"],
};

const termsText = (terms?: string | null) => {
  const pair = TERMS[terms ?? "prepaid"];
  return pair ? `${pair[0]} / ${pair[1]}` : String(terms);
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
  // The font has the dollar and riel signs but not €, £, ¥ …, so other
  // currencies print their code ("EUR 110.00") instead of a blank.
  const currency = order.currency_code.toUpperCase();
  const money = (amount?: number | null) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: ["USD", "KHR"].includes(currency) ? "narrowSymbol" : "code",
    }).format(Number(amount ?? 0));
  const paid = Number(order.paid_total ?? 0);
  const due = Math.max(0, Number(order.total) - paid);

  const totals: [string, string][] = [
    [label("subtotal"), money(order.subtotal)],
    ...(order.discount_total
      ? [[label("discount"), `-${money(order.discount_total)}`] as [string, string]]
      : []),
    [label("shipping"), money(order.shipping_total)],
    [label("tax"), money(order.tax_total)],
    [label("total"), money(order.total)],
    [label("paid"), money(paid)],
    [label("amount_due"), money(due)],
  ];

  const content: Content[] = [
    {
      columns: [
        [
          { text: seller.name, style: "seller" },
          ...[seller.address, seller.email, seller.phone]
            .filter(Boolean)
            .map((text) => ({ text: text as string })),
          ...(seller.tax_id ? [{ text: `${label("tax_id")}: ${seller.tax_id}` }] : []),
        ],
        {
          stack: [
            { text: label("invoice"), style: "title" },
            { text: invoiceNumber(invoice.display_id), bold: true },
            { text: `${label("order")} #${order.display_id ?? ""}` },
            { text: `${label("issued")}: ${day(invoice.issued_at)}` },
            { text: `${label("due")}: ${day(invoice.due_at)}` },
            { text: `${label("terms")}: ${termsText(invoice.payment_terms)}` },
            {
              text: label(due === 0 ? "paid_stamp" : "unpaid_stamp"),
              bold: true,
              margin: [0, 4, 0, 0],
            },
          ],
          alignment: "right",
        },
      ],
    },
    {
      margin: [0, 24, 0, 12],
      columns: [
        [
          { text: label("bill_to"), style: "label" },
          ...(invoice.company_name ? [{ text: invoice.company_name, bold: true }] : []),
          ...(invoice.tax_id ? [{ text: `${label("tax_id")}: ${invoice.tax_id}` }] : []),
          ...addressLines(order.billing_address ?? order.shipping_address ?? null).map(
            (text) => ({ text })
          ),
          ...(order.email ? [{ text: order.email }] : []),
        ],
        [
          { text: label("ship_to"), style: "label" },
          ...addressLines(order.shipping_address ?? null).map((text) => ({ text })),
        ],
      ],
    },
    {
      table: {
        headerRows: 1,
        widths: ["*", "auto", "auto", "auto", "auto"],
        body: [
          (["item", "sku", "qty", "unit_price", "amount"] as const).map((key) => ({
            stack: [
              { text: L[key][0], style: "th" },
              { text: L[key][1], style: "thKm" },
            ],
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
    defaultStyle: { font: "KantumruyPro", fontSize: 10 },
    styles: {
      title: { fontSize: 18, bold: true },
      seller: { fontSize: 14, bold: true },
      label: { bold: true, color: "#666666", margin: [0, 0, 0, 2] },
      th: { bold: true },
      thKm: { fontSize: 8, color: "#666666" },
    },
  };
}

// The font files ship in the npm package (a dependency, so they are in the
// production image too).
const font = (weight: 400 | 700) =>
  require.resolve(
    `@fontsource/kantumruy-pro/files/kantumruy-pro-khmer-${weight}-normal.woff`
  );

const printer = new PdfPrinter({
  KantumruyPro: {
    normal: font(400),
    bold: font(700),
    italics: font(400),
    bolditalics: font(700),
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
