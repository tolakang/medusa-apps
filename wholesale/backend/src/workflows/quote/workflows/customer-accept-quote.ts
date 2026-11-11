import {
  confirmOrderEditRequestWorkflow,
  useRemoteQueryStep,
} from "@medusajs/medusa/core-flows";
import { OrderStatus } from "@medusajs/framework/utils";
import { createWorkflow } from "@medusajs/framework/workflows-sdk";
import { ensureInvoiceWorkflow } from "../../invoice/ensure-invoice";
import { updateOrderWorkflow } from "../../order/workflows/update-order";
import { validateQuoteAcceptanceStep } from "../steps/validate-quote-acceptance";
import { validateQuoteBuyerStep } from "../steps/validate-quote-buyer";
import { updateQuotesWorkflow } from "./update-quote";

/*
  A workflow that accepts a quote by a customer. 
  
  Once the customer accepts the quote, any staged changes made on the draft order is then committed.
  The draft order is then converted to an actual order ready for processing.
*/
export const customerAcceptQuoteWorkflow = createWorkflow(
  "customer-accept-quote",
  function (input: { quote_id: string; customer_id: string }) {
    const quote = useRemoteQueryStep({
      entry_point: "quote",
      fields: ["id", "draft_order_id", "status"],
      variables: { id: input.quote_id },
      list: false,
      throw_if_key_not_found: true,
    });

    validateQuoteAcceptanceStep({ quote });

    // P4-05: the checkout rules, before anything changes.
    validateQuoteBuyerStep({
      quote_id: input.quote_id,
      customer_id: input.customer_id,
    });

    updateQuotesWorkflow.runAsStep({
      input: [{ id: input.quote_id, status: "accepted" }],
    });

    confirmOrderEditRequestWorkflow.runAsStep({
      input: {
        order_id: quote.draft_order_id,
        confirmed_by: input.customer_id,
      },
    });

    updateOrderWorkflow.runAsStep({
      input: {
        id: quote.draft_order_id,
        is_draft_order: false,
        status: OrderStatus.PENDING,
      },
    });

    // The quote is an order now: its invoice is issued today, so the payment
    // terms run from the acceptance (REVIEW_FIXES B2).
    ensureInvoiceWorkflow.runAsStep({
      input: { order_id: quote.draft_order_id },
    });
  }
);
