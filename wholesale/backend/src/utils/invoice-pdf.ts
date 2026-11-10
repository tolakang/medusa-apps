import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { MedusaResponse } from "@medusajs/framework";
import { renderInvoicePdf, sellerFromEnv } from "../modules/invoice/pdf";
import { invoiceNumber } from "../modules/invoice/terms";
import { loadBuyer } from "./load-b2b-buyer";
import { ensureInvoiceWorkflow } from "../workflows/invoice/ensure-invoice";

// P4-06: the order's invoice PDF (created on first use) and who may see it.

const ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "customer_id",
  "currency_code",
  "subtotal",
  "shipping_total",
  "discount_total",
  "tax_total",
  "total",
  "items.title",
  "items.variant_sku",
  "items.quantity",
  "items.unit_price",
  "items.total",
  "billing_address.*",
  "shipping_address.*",
  "payment_collections.captured_amount",
];

export async function invoicePdfForOrder(
  container: MedusaContainer,
  orderId: string
) {
  const { result: invoice } = await ensureInvoiceWorkflow(container).run({
    input: { order_id: orderId },
  });
  const {
    data: [order],
  } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { id: orderId },
  });

  const paid = (order.payment_collections ?? []).reduce(
    (sum, collection) => sum + Number(collection?.captured_amount ?? 0),
    0
  );
  const pdf = await renderInvoicePdf({
    invoice,
    order: {
      ...order,
      total: Number(order.total),
      paid_total: paid,
      items: (order.items ?? []).filter(Boolean).map((item) => ({
        title: item!.title,
        variant_sku: item!.variant_sku,
        quantity: Number(item!.quantity),
        unit_price: Number(item!.unit_price),
        total: Number(item!.total),
      })),
    } as Parameters<typeof renderInvoicePdf>[0]["order"],
    seller: sellerFromEnv(),
  });
  return { pdf, number: invoiceNumber(invoice.display_id) };
}

export function sendPdf(res: MedusaResponse, pdf: Buffer, number: string) {
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${number}.pdf"`,
    "Content-Length": String(pdf.length),
  });
  res.send(pdf);
}

/**
 * A customer sees the invoices of their own orders; a company admin also
 * those of their colleagues. Anyone else gets 404 (P4-07 rule).
 */
export async function assertCanSeeOrderInvoice(
  container: MedusaContainer,
  orderId: string,
  customerId: string
) {
  const {
    data: [order],
  } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "customer_id", "is_draft_order", "status"],
    filters: { id: orderId },
  });
  const notFound = new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found");
  if (!order || order.is_draft_order || order.status === "draft") {
    throw notFound;
  }
  if (order.customer_id === customerId) {
    return;
  }
  const [viewer, owner] = await Promise.all([
    loadBuyer(container, customerId),
    loadBuyer(container, order.customer_id),
  ]);
  const company = viewer?.employee?.company?.id;
  if (!viewer?.employee?.is_admin || !company || company !== owner?.employee?.company?.id) {
    throw notFound;
  }
}
