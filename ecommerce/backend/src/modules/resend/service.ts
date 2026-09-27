import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { renderEmail } from "./templates"

// Resend email provider (TASKS D2, P1-04). Structure follows Medusa's guide
// "Integrate Medusa with Resend (Email Notifications)"; it calls Resend's REST
// API (resend.com/docs/api-reference/emails/send-email) instead of the SDK, so
// the backend needs no new dependency.
export type ResendOptions = {
  api_key: string
  // "Shop name <orders@your-domain>", a sender on a domain verified in Resend.
  from: string
}

type InjectedDependencies = {
  logger: Logger
}

export const RESEND_EMAILS_URL = "https://api.resend.com/emails"

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-resend"
  protected options_: ResendOptions
  protected logger_: Logger

  constructor({ logger }: InjectedDependencies, options: ResendOptions) {
    super()
    this.options_ = options
    this.logger_ = logger
  }

  static validateOptions(options: Record<string, unknown>) {
    if (!options.api_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `api_key` is required in the Resend provider's options."
      )
    }
    if (!options.from) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `from` is required in the Resend provider's options."
      )
    }
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const email = renderEmail(notification.template, notification.data)
    if (!email) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `No email template "${notification.template}".`
      )
    }

    const response = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options_.api_key}`,
        "Content-Type": "application/json",
        // Resend drops a repeated request with the same key for 24 hours. The
        // provider DTO has no idempotency_key, so the workflow passes it in
        // provider_data (ProviderSendNotificationDTO, @medusajs/types 2.21.1).
        ...(typeof notification.provider_data?.idempotency_key === "string"
          ? { "Idempotency-Key": notification.provider_data.idempotency_key }
          : {}),
      },
      body: JSON.stringify({
        from: notification.from || this.options_.from,
        to: [notification.to],
        subject: email.subject,
        html: email.html,
      }),
    })

    const body = (await response.json().catch(() => ({}))) as {
      id?: string
      message?: string
    }
    if (!response.ok || !body.id) {
      // The Notification Module marks the notification as failed.
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Resend returned ${response.status}: ${body.message ?? "no message"}`
      )
    }
    this.logger_.info(`Resend accepted email ${body.id} (${notification.template}).`)
    return { id: body.id }
  }
}

export default ResendNotificationProviderService
