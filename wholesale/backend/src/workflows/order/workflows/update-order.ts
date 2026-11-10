import { useRemoteQueryStep } from "@medusajs/medusa/core-flows";
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { OrderStatus } from "@medusajs/framework/types";
import { updateOrderStep } from "../steps/update-order";

/*
  A workflow to update the order. We use this in the quote workflows to convert a draft order
  to an active order.
*/
export const updateOrderWorkflow = createWorkflow(
  // eslint-disable-next-line @medusajs/workflow-id-matches-export-or-filename
  "b2b-update-order-workflow",
  function (input: { id: string; is_draft_order: boolean; status: OrderStatus }) {
    useRemoteQueryStep({
      entry_point: "order",
      fields: ["id"],
      variables: { id: input.id },
      list: false,
      throw_if_key_not_found: true,
    });

    updateOrderStep(input);

    return new WorkflowResponse(void 0);
  }
);
