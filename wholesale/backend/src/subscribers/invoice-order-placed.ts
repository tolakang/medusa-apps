import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ensureInvoiceWorkflow } from "../workflows/invoice/ensure-invoice";

// P4-06: every placed order gets its invoice number at once. Accepted
// quotes (draft orders turned into orders) get theirs when the buyer accepts
// (customerAcceptQuoteWorkflow).
export default async function invoiceOnOrderPlaced({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    await ensureInvoiceWorkflow(container).run({ input: { order_id: data.id } });
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`Invoice for order ${data.id} not created: ${(error as Error).message}`);
  }
}

export const config: SubscriberConfig = { event: "order.placed" };
