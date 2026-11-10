import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { INVOICE_MODULE } from "../../../modules/invoice";
import InvoiceModuleService from "../../../modules/invoice/service";
import { invoiceDueDate } from "../../../modules/invoice/terms";
import { loadBuyer } from "../../../utils/load-b2b-buyer";

/**
 * P4-06: the order's invoice, created on first use. The company, tax ID and
 * payment terms come from the customer's employee record (never order
 * metadata). Draft orders (quotes not yet accepted) get none.
 */
export const ensureInvoiceStep = createStep(
  "ensure-invoice",
  async (input: { order_id: string }, { container }) => {
    const invoices = container.resolve<InvoiceModuleService>(INVOICE_MODULE);
    const [existing] = await invoices.listInvoices({ order_id: input.order_id });
    if (existing) {
      return new StepResponse(existing, null);
    }

    const {
      data: [order],
    } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "order",
      fields: ["id", "customer_id", "created_at", "status", "is_draft_order"],
      filters: { id: input.order_id },
    });
    if (!order) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found");
    }
    if (order.is_draft_order || order.status === "draft") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "A draft order has no invoice yet."
      );
    }

    const company = (await loadBuyer(container, order.customer_id))?.employee
      ?.company;
    const issuedAt = new Date(order.created_at as string | Date);
    const created = await invoices.createInvoices({
      order_id: order.id,
      company_id: company?.id ?? null,
      company_name: company?.name ?? null,
      tax_id: company?.tax_id ?? null,
      payment_terms: company?.payment_terms ?? "prepaid",
      issued_at: issuedAt,
      due_at: invoiceDueDate(issuedAt, company?.payment_terms),
    });

    return new StepResponse(created, created.id);
  },
  async (createdId: string | null, { container }) => {
    if (!createdId) {
      return;
    }
    await container
      .resolve<InvoiceModuleService>(INVOICE_MODULE)
      .deleteInvoices(createdId);
  }
);
