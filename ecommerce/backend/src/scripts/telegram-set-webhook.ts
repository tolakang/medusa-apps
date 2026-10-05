import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { TELEGRAM_API_URL } from "../modules/telegram/service"

// One-time setup of the customer bot's webhook (TASKS P1-17), Telegram Bot API
// setWebhook (core.telegram.org/bots/api): url, secret_token (sent back in
// X-Telegram-Bot-Api-Secret-Token), allowed_updates. Run on the server:
//   docker-entrypoint.sh medusa exec ./src/scripts/telegram-set-webhook.js https://<api host>/telegram/webhook
// Needs TELEGRAM_CUSTOMER_BOT_TOKEN and TELEGRAM_CUSTOMER_WEBHOOK_SECRET in env.
export default async function telegramSetWebhook({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const [url] = args
  const token = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN
  const secret = process.env.TELEGRAM_CUSTOMER_WEBHOOK_SECRET
  if (!url?.startsWith("https://") || !token || !secret) {
    throw new MedusaError(
      MedusaError.Types.INVALID_ARGUMENT,
      "Usage: medusa exec ./src/scripts/telegram-set-webhook.js https://<api host>/telegram/webhook " +
        "(with TELEGRAM_CUSTOMER_BOT_TOKEN and TELEGRAM_CUSTOMER_WEBHOOK_SECRET set)"
    )
  }

  const response = await fetch(`${TELEGRAM_API_URL}/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, secret_token: secret, allowed_updates: ["message"] }),
  })
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string }
  // The token is part of the request URL, so only Telegram's reply is logged.
  if (!response.ok || !body.ok) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Telegram setWebhook failed (${response.status}): ${body.description ?? "no description"}`
    )
  }
  logger.info(`Telegram webhook set to ${url}: ${body.description ?? "ok"}`)
}
