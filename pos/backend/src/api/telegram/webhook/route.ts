import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { safeEqual } from "../../../lib/safe-equal"
import {
  parseOrderLinkPayload,
  startPayload,
  telegramCustomerConfig,
  TELEGRAM_WEBHOOK_SECRET_HEADER,
} from "../../../lib/telegram-customer"
import {
  linkTelegramChatWorkflow,
  sendTelegramStartHelpWorkflow,
} from "../../../workflows/telegram-customer"

// POST /telegram/webhook: updates for the customer bot (TASKS P1-17), set up
// with setWebhook (src/scripts/telegram-set-webhook.ts). Telegram sends the
// secret_token in X-Telegram-Bot-Api-Secret-Token and retries on any non-2xx
// reply (core.telegram.org/bots/api), so after the secret check this always
// answers 200 and logs problems instead.

type TelegramUpdate = {
  message?: { text?: string; chat?: { id?: number; type?: string } }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const config = telegramCustomerConfig()
  if (!config) {
    return res.status(404).json({ message: "Telegram order updates are not set up." })
  }
  if (!safeEqual(req.headers[TELEGRAM_WEBHOOK_SECRET_HEADER], config.secret)) {
    return res.status(401).json({ message: "Unauthorized" })
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const message = (req.body as TelegramUpdate | undefined)?.message
  const chatId = message?.chat?.id
  const payload = startPayload(message?.text)
  // Only /start in a private chat with the bot; everything else is ignored.
  if (payload === null || typeof chatId !== "number" || message?.chat?.type !== "private") {
    return res.status(200).json({ ok: true })
  }

  try {
    const orderId = payload ? parseOrderLinkPayload(payload, config.secret) : null
    if (orderId) {
      await linkTelegramChatWorkflow(req.scope).run({
        input: { order_id: orderId, chat_id: String(chatId) },
      })
    } else {
      await sendTelegramStartHelpWorkflow(req.scope).run({
        input: { chat_id: String(chatId) },
      })
    }
  } catch (e) {
    logger.warn(`Telegram /start could not be handled: ${(e as Error).message}`)
  }
  res.status(200).json({ ok: true })
}
