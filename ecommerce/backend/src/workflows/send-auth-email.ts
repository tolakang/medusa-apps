import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { sendNotificationsStep } from "@medusajs/medusa/core-flows"
import type { AuthEmailData } from "../lib/auth-email"

// Sends one account email (verification or password reset, TASKS P1-18) on
// the email channel (Resend; notification-local when no key is set).
// Retry-safe: the Notification Module skips an idempotency_key that already
// succeeded (@medusajs/notification createNotifications).
export const sendAuthEmailWorkflow = createWorkflow(
  "send-auth-email",
  function (input: { to: string; template: string; data: AuthEmailData; idempotency_key: string }) {
    const notifications = transform({ input }, ({ input }) => [
      {
        to: input.to,
        channel: "email",
        template: input.template,
        data: input.data,
        trigger_type: input.template,
        idempotency_key: input.idempotency_key,
        // Also sent to Resend as its Idempotency-Key header.
        provider_data: { idempotency_key: input.idempotency_key },
      },
    ])
    return new WorkflowResponse(sendNotificationsStep(notifications))
  }
)
