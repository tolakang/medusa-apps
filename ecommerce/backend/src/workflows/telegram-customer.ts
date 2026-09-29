import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  sendNotificationsStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import {
  ORDER_CONFIRMED_CUSTOMER_TEMPLATE,
  ORDER_NOTIFICATION_FIELDS,
} from "../lib/order-notification"
import { TELEGRAM_CUSTOMER_CHANNEL } from "../lib/telegram-customer"
import { TELEGRAM_START_HELP_TEMPLATE } from "../modules/telegram/templates"
import { TELEGRAM_LINKS_MODULE } from "../modules/telegram-links"
import type TelegramLinksModuleService from "../modules/telegram-links/service"

// Customer order updates on Telegram (TASKS P1-17). Messages go through the
// Notification Module on channel "telegram_customer" (the customer bot).

type ChatInput = { order_id: string; chat_id: string }

// Saves the chat for the order once; a second /start for the same order and
// chat reuses the row.
const linkTelegramChatStep = createStep(
  "link-telegram-chat",
  async (input: ChatInput, { container }) => {
    const service: TelegramLinksModuleService = container.resolve(TELEGRAM_LINKS_MODULE)
    const [existing] = await service.listTelegramOrderChats(input)
    if (existing) {
      return new StepResponse(existing, null)
    }
    const created = await service.createTelegramOrderChats(input)
    return new StepResponse(created, created.id)
  },
  async (createdId: string | null, { container }) => {
    if (!createdId) {
      return
    }
    const service: TelegramLinksModuleService = container.resolve(TELEGRAM_LINKS_MODULE)
    await service.deleteTelegramOrderChats(createdId)
  }
)

// /start <signed order link> → remember the chat, send the order confirmation.
export const linkTelegramChatWorkflow = createWorkflow(
  "link-telegram-chat",
  function (input: ChatInput) {
    const { data: orders } = useQueryGraphStep({
      entity: "order",
      fields: ORDER_NOTIFICATION_FIELDS,
      filters: { id: input.order_id },
      options: { throwIfKeyNotFound: true },
    })
    linkTelegramChatStep(input)

    // No idempotency key: tapping the button again sends the confirmation again.
    const notifications = transform({ orders, input }, ({ orders, input }) => [
      {
        to: input.chat_id,
        channel: TELEGRAM_CUSTOMER_CHANNEL,
        template: ORDER_CONFIRMED_CUSTOMER_TEMPLATE,
        data: { order: orders[0] },
        trigger_type: "telegram.start",
        resource_id: orders[0].id,
        resource_type: "order",
      },
    ])
    return new WorkflowResponse(sendNotificationsStep(notifications))
  }
)

// Order event → message to every chat following the order. Retry-safe: one
// idempotency key per template, order and chat.
export const notifyTelegramCustomersWorkflow = createWorkflow(
  "notify-telegram-customers",
  function (input: { order_id: string; template: string }) {
    const { data: chats } = useQueryGraphStep({
      entity: "telegram_order_chat",
      fields: ["chat_id"],
      filters: { order_id: input.order_id },
    }).config({ name: "telegram-order-chats" })

    const sent = when("has-telegram-chats", { chats }, ({ chats }) => chats.length > 0).then(
      () => {
        const { data: orders } = useQueryGraphStep({
          entity: "order",
          fields: ORDER_NOTIFICATION_FIELDS,
          filters: { id: input.order_id },
          options: { throwIfKeyNotFound: true },
        }).config({ name: "telegram-order" })

        const notifications = transform({ orders, chats, input }, ({ orders, chats, input }) =>
          chats.map((chat) => ({
            to: chat.chat_id,
            channel: TELEGRAM_CUSTOMER_CHANNEL,
            template: input.template,
            data: { order: orders[0] },
            trigger_type: input.template,
            resource_id: orders[0].id,
            resource_type: "order",
            idempotency_key: `${input.template}:${orders[0].id}:${chat.chat_id}`,
          }))
        )
        return sendNotificationsStep(notifications)
      }
    )
    return new WorkflowResponse({ sent })
  }
)

// Reply for "/start" without a valid order link.
export const sendTelegramStartHelpWorkflow = createWorkflow(
  "send-telegram-start-help",
  function (input: { chat_id: string }) {
    const notifications = transform({ input }, ({ input }) => [
      {
        to: input.chat_id,
        channel: TELEGRAM_CUSTOMER_CHANNEL,
        template: TELEGRAM_START_HELP_TEMPLATE,
        data: {},
      },
    ])
    return new WorkflowResponse(sendNotificationsStep(notifications))
  }
)
