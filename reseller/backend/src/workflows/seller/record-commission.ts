import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { recordSellerCommissionStep } from "./steps/record-commission"

/**
 * record-seller-commission (plan §6.5, TASKS P5-04): order → sales channel →
 * seller → commission. Idempotent: run by the order.placed subscriber, and
 * an event delivered twice (or two at once) still makes one commission.
 */
export const recordSellerCommissionWorkflow = createWorkflow(
  "record-seller-commission",
  function (input: { order_id: string }) {
    const key = transform(input, (input) => `seller-commission:${input.order_id}`)
    acquireLockStep({ key, timeout: 10, ttl: 30 })
    const result = recordSellerCommissionStep(input)
    releaseLockStep({ key })
    return new WorkflowResponse(result)
  }
)
