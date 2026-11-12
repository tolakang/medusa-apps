import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateSellerStep, UpdateSellerInput } from "./steps/update-seller"

/**
 * TASKS F-081 (plan §6.5): the shop activates or suspends a seller, or
 * changes their name, domain or commission rate. Only an active seller's
 * domain resolves to their channel (P5-07) and only their orders earn a
 * commission (P5-04); a suspended seller's sign-in stops working at once
 * (`src/api/seller-auth.ts`). A new rate applies to orders placed from now on.
 */
export const updateSellerWorkflow = createWorkflow(
  "update-seller",
  function (input: UpdateSellerInput) {
    return new WorkflowResponse(updateSellerStep(input))
  }
)
