import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  sendNotificationsStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import {
  ORDER_ALREADY_LINKED_CUSTOMER_TEMPLATE,
  ORDER_CONFIRMED_CUSTOMER_TEMPLATE,
  ORDER_NOTIFICATION_FIELDS,
  ORDER_STATUS_TEMPLATES,
  type OrderStatusUpdate,
} from "../lib/order-notification"
import { TELEGRAM_CUSTOMER_CHANNEL } from "../lib/telegram-customer"
import { TELEGRAM_START_HELP_TEMPLATE } from "../modules/telegram/templates"
import { TELEGRAM_LINKS_MODULE } from "../modules/telegram-links"
import type TelegramLinksModuleService from "../modules/telegram-links/service"

// Customer order updates on Telegram (TASKS P1-17). Messages go through the
// Notification Module on channel "telegram_customer" (the customer bot).

type ChatInput = { order_id: string; chat_id: string }

// Saves the chat for the order once; a second /start for the same order and
// chat reuses the row. Two taps at the same moment: the unique index on
// (order_id, chat_id) refuses the second row, which then counts as existing.
const linkTelegramChatStep = createStep(
  "link-telegram-chat",
  async (input: ChatInput, { container }) => {
    const service: TelegramLinksModuleService = container.resolve(TELEGRAM_LINKS_MODULE)
    const [existing] = await service.listTelegramOrderChats(input)
    if (existing) {
      return new StepResponse({ created: false }, null)
    }
    try {
      const created = await service.createTelegramOrderChats(input)
      return new StepResponse({ created: true }, created.id)
    } catch (e) {
      const [saved] = await service.listTelegramOrderChats(input)
      if (saved) {
        return new StepResponse({ created: false }, null)
      }
      throw e
    }
  },
  async (createdId: string | null, { container }) => {
    if (!createdId) {
      return
    }
    const service: TelegramLinksModuleService = container.resolve(TELEGRAM_LINKS_MODULE)
    await service.deleteTelegramOrderChats(createdId)
  }
)

// /start <signed order link> → remember the chat and send the order
// confirmation. A repeat tap for the same order and chat gets a short "already
// getting updates" reply instead of the whole confirmation again (owner,
// 2026-09-29). No idempotency key: every tap gets an answer.
export const linkTelegramChatWorkflow = createWorkflow(
  "link-telegram-chat",
  function (input: ChatInput) {
    const { data: orders } = useQueryGraphStep({
      entity: "order",
      fields: ORDER_NOTIFICATION_FIELDS,
      filters: { id: input.order_id },
      options: { throwIfKeyNotFound: true },
    })
    const link = linkTelegramChatStep(input)

    const notifications = transform({ orders, input, link }, ({ orders, input, link }) => [
      {
        to: input.chat_id,
        channel: TELEGRAM_CUSTOMER_CHANNEL,
        template: link.created
          ? ORDER_CONFIRMED_CUSTOMER_TEMPLATE
          : ORDER_ALREADY_LINKED_CUSTOMER_TEMPLATE,
        data: { order: orders[0] },
        trigger_type: "telegram.start",
        resource_id: orders[0].id,
        resource_type: "order",
      },
    ])
    return new WorkflowResponse(sendNotificationsStep(notifications))
  }
)

// Order shipped / delivered / canceled → an alert to the staff group (channel
// "telegram", owner 2026-09-29) and, unless the event says no_notification, a
// message to every customer chat following the order (P1-17). Retry-safe: one
// idempotency key per template, order, fulfillment (an order sent in two
// parcels gets two shipped and two delivered messages) and recipient.
export const notifyOrderStatusWorkflow = createWorkflow(
  "notify-order-status",
  function (input: {
    order_id: string
    status: OrderStatusUpdate
    notify_customer: boolean
    fulfillment_id?: string
  }) {
    const { data: orders } = useQueryGraphStep({
      entity: "order",
      fields: ORDER_NOTIFICATION_FIELDS,
      filters: { id: input.order_id },
      options: { throwIfKeyNotFound: true },
    }).config({ name: "status-order" })
    const { data: chats } = useQueryGraphStep({
      entity: "telegram_order_chat",
      fields: ["chat_id"],
      filters: { order_id: input.order_id },
    }).config({ name: "status-order-chats" })

    const notifications = transform({ orders, chats, input }, ({ orders, chats, input }) => {
      const order = orders[0]
      const templates = ORDER_STATUS_TEMPLATES[input.status]
      const event = input.fulfillment_id ? `${order.id}:${input.fulfillment_id}` : order.id
      const common = {
        data: { order },
        trigger_type: `order.${input.status}`,
        resource_id: order.id,
        resource_type: "order",
      }
      return [
        {
          ...common,
          // The staff bot always posts to its configured group.
          to: "staff",
          channel: "telegram",
          template: templates.staff,
          idempotency_key: `${templates.staff}:${event}`,
        },
        ...(input.notify_customer ? chats : []).map((chat) => ({
          ...common,
          to: chat.chat_id,
          channel: TELEGRAM_CUSTOMER_CHANNEL,
          template: templates.customer,
          idempotency_key: `${templates.customer}:${event}:${chat.chat_id}`,
        })),
      ]
    })
    return new WorkflowResponse(sendNotificationsStep(notifications))
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
