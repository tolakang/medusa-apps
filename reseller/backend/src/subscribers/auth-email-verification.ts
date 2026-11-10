import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { AuthWorkflowEvents, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { authEmailKey, storefrontLink, VERIFY_EMAIL_TEMPLATE } from "../lib/auth-email"
import { sendAuthEmailWorkflow } from "../workflows/send-auth-email"

// Email verification for new customer accounts (TASKS P1-18), enabled with
// http.authVerificationsPerActor in medusa-config.ts. Payload of
// auth.verification_requested since v2.17 (docs "Email Verification", Event
// Payload): entity_id (the email), entity_type, code, code_provider,
// auth_identity_id, expires_at, metadata. The storefront's /verify-account page
// confirms the code (POST /auth/verification/confirm).
type VerificationRequested = {
  entity_id: string
  entity_type: string
  code: string
  code_provider: string
  auth_identity_id: string
  expires_at: string
  metadata?: Record<string, unknown>
}

export default async function authEmailVerification({
  event: { data },
  container,
}: SubscriberArgs<VerificationRequested>) {
  if (data.entity_type !== "email") {
    return
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const url = storefrontLink(config, "verify-account", { token: data.code, email: data.entity_id })
  if (!url) {
    logger.warn("Email verification not sent: set STOREFRONT_URL (admin.storefrontUrl).")
    return
  }
  const minutes = Math.round((new Date(data.expires_at).getTime() - Date.now()) / 60000)
  await sendAuthEmailWorkflow(container).run({
    input: {
      to: data.entity_id,
      template: VERIFY_EMAIL_TEMPLATE,
      data: { url, ...(Number.isFinite(minutes) && minutes > 0 ? { expires_minutes: minutes } : {}) },
      idempotency_key: authEmailKey("verify-email", data.code),
    },
  })
}

export const config: SubscriberConfig = {
  event: AuthWorkflowEvents.VERIFICATION_REQUESTED,
}
