import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { renderMessage } from "./templates"

// Telegram staff alerts (TASKS D2, P1-04): the bot posts to one chat, e.g. the
// owner's staff group. Telegram Bot API sendMessage (core.telegram.org/bots/api):
// POST https://api.telegram.org/bot<token>/sendMessage { chat_id, text }.
export type TelegramOptions = {
  bot_token: string
  // Group chat IDs are negative numbers, e.g. -1001234567890.
  chat_id: string
}

type InjectedDependencies = {
  logger: Logger
}

export const TELEGRAM_API_URL = "https://api.telegram.org"
// Telegram rejects messages longer than 4096 characters.
const MAX_TEXT_LENGTH = 4096

class TelegramNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-telegram"
  protected options_: TelegramOptions
  protected logger_: Logger

  constructor({ logger }: InjectedDependencies, options: TelegramOptions) {
    super()
    this.options_ = options
    this.logger_ = logger
  }

  static validateOptions(options: Record<string, unknown>) {
    if (!options.bot_token) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `bot_token` is required in the Telegram provider's options."
      )
    }
    if (!options.chat_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `chat_id` is required in the Telegram provider's options."
      )
    }
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const text = renderMessage(notification.template, notification.data)
    if (!text) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `No Telegram template "${notification.template}".`
      )
    }

    const response = await fetch(
      `${TELEGRAM_API_URL}/bot${this.options_.bot_token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Always the configured staff chat; `to` only labels the notification.
        body: JSON.stringify({
          chat_id: this.options_.chat_id,
          text: text.slice(0, MAX_TEXT_LENGTH),
        }),
      }
    )

    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean
      result?: { message_id?: number }
      description?: string
    }
    if (!response.ok || !body.ok) {
      // Never log the token: it is part of the URL, so only the reply is logged.
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Telegram returned ${response.status}: ${body.description ?? "no description"}`
      )
    }
    const id = String(body.result?.message_id ?? "")
    this.logger_.info(`Telegram message ${id} sent (${notification.template}).`)
    return { id }
  }
}

export default TelegramNotificationProviderService
