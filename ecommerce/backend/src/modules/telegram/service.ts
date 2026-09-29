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

// Telegram messages. Telegram Bot API sendMessage (core.telegram.org/bots/api):
// POST https://api.telegram.org/bot<token>/sendMessage { chat_id, text }.
// Registered twice in medusa-config.ts:
// - staff alerts (TASKS D2, P1-04): `chat_id` set, always posts to that chat
//   (e.g. the owner's staff group); the notification's `to` is only a label.
// - customer updates (P1-17): `per_recipient`, posts to the notification's
//   `to`, the chat of a customer who started the customer bot.
export type TelegramOptions = {
  bot_token: string
  // Group chat IDs are negative numbers, e.g. -1001234567890.
  chat_id?: string
  // true = send to each notification's `to` (customer bot); chat_id unused.
  per_recipient?: boolean
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
    if (!options.per_recipient && !options.chat_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `chat_id` is required in the Telegram provider's options (or set `per_recipient`)."
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

    const chatId = this.options_.per_recipient ? notification.to : this.options_.chat_id
    if (!/^-?\d+$/.test(chatId ?? "")) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No Telegram chat: set the provider's `chat_id` or pass a chat ID as `to`."
      )
    }

    const response = await fetch(
      `${TELEGRAM_API_URL}/bot${this.options_.bot_token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: text.slice(0, MAX_TEXT_LENGTH) }),
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
