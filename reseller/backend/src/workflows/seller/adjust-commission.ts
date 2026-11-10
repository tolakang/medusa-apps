import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { adjustSellerCommissionStep } from "./steps/adjust-commission"

/**
 * cancel-commission (plan §6.5, TASKS P5-04), on order.canceled and
 * payment.refunded. Same lock as recording, so the two never interleave.
 */
export const adjustSellerCommissionWorkflow = createWorkflow(
  "adjust-seller-commission",
  function (input: { order_id: string; kind: "canceled" | "refunded" }) {
    const key = transform(input, (input) => `seller-commission:${input.order_id}`)
    acquireLockStep({ key, timeout: 10, ttl: 30 })
    const result = adjustSellerCommissionStep(input)
    releaseLockStep({ key })
    return new WorkflowResponse(result)
  }
)
