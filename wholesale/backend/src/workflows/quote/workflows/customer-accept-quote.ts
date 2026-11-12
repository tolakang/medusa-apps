import {
  confirmOrderEditRequestWorkflow,
  convertDraftOrderWorkflow,
  useRemoteQueryStep,
} from "@medusajs/medusa/core-flows";
import { createWorkflow } from "@medusajs/framework/workflows-sdk";
import { ensureInvoiceWorkflow } from "../../invoice/ensure-invoice";
import { validateQuoteAcceptanceStep } from "../steps/validate-quote-acceptance";
import { validateQuoteBuyerStep } from "../steps/validate-quote-buyer";
import { updateQuotesWorkflow } from "./update-quote";

/*
  A workflow that accepts a quote by a customer. 
  
  Once the customer accepts the quote, the draft order becomes an order with
  core's convertDraftOrderWorkflow, which reserves stock for every item and
  emits order.placed (MEDUSA_SKILL "Draft orders"); the merchant's staged
  changes are then committed, and the order edit swaps the reservations of
  the items it added or changed. Before review 2 (S3) the draft was only
  flagged as an order, so unchanged items had no reservation: the shop
  could oversell them and staff couldn't fulfil the order.
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

    convertDraftOrderWorkflow.runAsStep({
      input: { id: quote.draft_order_id },
    });

    confirmOrderEditRequestWorkflow.runAsStep({
      input: {
        order_id: quote.draft_order_id,
        confirmed_by: input.customer_id,
      },
    });

    // The quote is an order now: its invoice is issued today, so the payment
    // terms run from the acceptance (REVIEW_FIXES B2).
    ensureInvoiceWorkflow.runAsStep({
      input: { order_id: quote.draft_order_id },
    });
  }
);
