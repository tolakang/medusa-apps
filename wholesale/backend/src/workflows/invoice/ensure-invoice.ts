import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { ensureInvoiceStep } from "./steps/ensure-invoice";

// P4-06: get or create the invoice of an order (order.placed subscriber,
// accepted quotes, and the download routes).
export const ensureInvoiceWorkflow = createWorkflow(
  "ensure-invoice",
  function (input: { order_id: string }) {
    return new WorkflowResponse(ensureInvoiceStep(input));
  }
);
