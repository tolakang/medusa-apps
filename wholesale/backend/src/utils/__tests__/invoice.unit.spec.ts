import { buildInvoiceDocument, renderInvoicePdf, sellerFromEnv } from "../../modules/invoice/pdf";
import { invoiceDueDate, invoiceNumber } from "../../modules/invoice/terms";

// P4-06: invoice numbers, due dates and the PDF.

const input = {
  invoice: {
    display_id: 7,
    company_name: "Acme Wholesale",
    tax_id: "KH-123",
    payment_terms: "net_30",
    issued_at: "2026-11-10T10:00:00Z",
    due_at: "2026-12-10T10:00:00Z",
  },
  order: {
    display_id: 42,
    email: "buyer@acme.test",
    currency_code: "eur",
    subtotal: 100,
    shipping_total: 10,
    tax_total: 0,
    total: 110,
    paid_total: 0,
    items: [{ title: "Paper", variant_sku: "P-1", quantity: 10, unit_price: 10, total: 100 }],
    shipping_address: { first_name: "A", last_name: "Buyer", address_1: "1 Trade St", city: "Berlin", country_code: "de" },
  },
  seller: { name: "Seller Co", address: "1 Main St", tax_id: "S-9", payment_note: "Bank: 123" },
};

describe("invoice terms", () => {
  it("numbers invoices INV-000001", () => {
    expect(invoiceNumber(1)).toEqual("INV-000001");
    expect(invoiceNumber(1234567)).toEqual("INV-1234567");
  });

  it.each([
    ["prepaid", "2026-11-10"],
    [null, "2026-11-10"],
    ["net_15", "2026-11-25"],
    ["net_30", "2026-12-10"],
    ["net_60", "2027-01-09"],
  ])("%s is due on %s", (terms, due) => {
    expect(
      invoiceDueDate(new Date("2026-11-10T10:00:00Z"), terms).toISOString().slice(0, 10)
    ).toEqual(due);
  });
});

describe("invoice PDF", () => {
  it("shows the number, terms, buyer, lines and what is due", () => {
    const text = JSON.stringify(buildInvoiceDocument(input).content);
    for (const expected of [
      "INV-000007",
      "Order #42",
      "Terms: Net 30",
      "Due: 2026-12-10",
      "Acme Wholesale",
      "Tax ID: KH-123",
      "Paper",
      "UNPAID",
      "Bank: 123",
      "€110.00",
    ]) {
      expect(text).toContain(expected);
    }
  });

  it("is PAID once the total is captured", () => {
    const text = JSON.stringify(
      buildInvoiceDocument({ ...input, order: { ...input.order, paid_total: 110 } }).content
    );
    expect(text).toContain("PAID");
    expect(text).not.toContain("UNPAID");
  });

  it("renders a PDF", async () => {
    const pdf = await renderInvoicePdf(input);
    expect(pdf.subarray(0, 5).toString()).toEqual("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("reads the seller from env", () => {
    expect(
      sellerFromEnv({ INVOICE_SELLER_NAME: "X", INVOICE_SELLER_ADDRESS: "a\\nb" })
    ).toEqual(expect.objectContaining({ name: "X", address: "a\nb" }));
    expect(sellerFromEnv({}).name).toEqual("Wholesale");
  });
});
