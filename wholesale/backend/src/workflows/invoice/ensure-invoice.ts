import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows";
import { ensureInvoiceStep } from "./steps/ensure-invoice";

// P4-06: get or create the invoice of an order (order.placed subscriber,
// quote acceptance, and the download routes). One at a time per order: two
// callers at once both found no invoice, and the second hit the unique
// `order_id` index (a 500 on the download, a skipped number; REVIEW_FIXES B9).
export const ensureInvoiceWorkflow = createWorkflow(
  "ensure-invoice",
  function (input: { order_id: string }) {
    const key = transform(input, (input) => `invoice:${input.order_id}`);
    acquireLockStep({ key, timeout: 10, ttl: 30 });
    const invoice = ensureInvoiceStep(input);
    releaseLockStep({ key });
    return new WorkflowResponse(invoice);
  }
);
