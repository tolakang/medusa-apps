import TelegramNotificationProviderService from "../service"
import { renderMessage, TELEGRAM_START_HELP_TEMPLATE } from "../templates"
import {
  orderLinkPayload,
  parseOrderLinkPayload,
  startPayload,
  telegramCustomerConfig,
  telegramStartUrl,
} from "../../../lib/telegram-customer"
import type { Logger } from "@medusajs/framework/types"

// Customer bot (TASKS P1-17). Fake token and chats only: fetch is mocked.
const logger = { info: jest.fn(), error: jest.fn() } as unknown as Logger
const ORDER_ID = "order_01M3NBR50R4KZKR4W6DWNJYT2N"
const SECRET = "test_secret-123"

describe("signed order links", () => {
  it("round-trips and fits Telegram's 64-character start parameter", () => {
    const payload = orderLinkPayload(ORDER_ID, SECRET)
    expect(payload).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    expect(parseOrderLinkPayload(payload, SECRET)).toEqual(ORDER_ID)
  })

  it("refuses a changed order ID, a wrong secret or junk", () => {
    const payload = orderLinkPayload(ORDER_ID, SECRET)
    const otherId = payload.replace("01M3", "01M4")
    expect(parseOrderLinkPayload(otherId, SECRET)).toBeNull()
    expect(parseOrderLinkPayload(payload, "other-secret")).toBeNull()
    expect(parseOrderLinkPayload("hello", SECRET)).toBeNull()
    expect(parseOrderLinkPayload("", SECRET)).toBeNull()
  })

  it("builds the t.me deep link from the env", () => {
    const config = telegramCustomerConfig({
      TELEGRAM_CUSTOMER_BOT_USERNAME: "@nokor24_shop_bot",
      TELEGRAM_CUSTOMER_WEBHOOK_SECRET: SECRET,
    })
    expect(config).toEqual({ botUsername: "nokor24_shop_bot", secret: SECRET })
    expect(telegramStartUrl(ORDER_ID, config!)).toEqual(
      `https://t.me/nokor24_shop_bot?start=${orderLinkPayload(ORDER_ID, SECRET)}`
    )
    expect(telegramCustomerConfig({ TELEGRAM_CUSTOMER_BOT_USERNAME: "x" })).toBeNull()
  })

  it("reads /start commands", () => {
    expect(startPayload("/start abc_DEF-1")).toEqual("abc_DEF-1")
    expect(startPayload("/start")).toEqual("")
    expect(startPayload("/start@nokor24_shop_bot abc")).toEqual("abc")
    expect(startPayload("hello")).toBeNull()
    expect(startPayload(undefined)).toBeNull()
  })
})

describe("customer messages", () => {
  const order = {
    display_id: 5,
    currency_code: "usd",
    total: 17,
    items: [{ title: "Medusa Shorts", variant_title: "L", quantity: 1, total: 15 }],
    shipping_address: { address_1: "Sihanouk Blvd", city: "Lvea Aem District", province: "Kandal" },
    shipping_methods: [{ name: "Phnom Penh Delivery" }],
  }

  it("confirms the order with items, address and delivery", () => {
    const text = renderMessage("order-confirmed-customer", { order })
    expect(text).toContain("✅ Order #5 confirmed — $17.00")
    expect(text).toContain("• 1 × Medusa Shorts (L)")
    expect(text).toContain("Deliver to: Sihanouk Blvd, Lvea Aem District, Kandal")
    expect(text).toContain("Delivery: Phnom Penh Delivery")
  })

  it("has shipped, delivered, canceled and help messages", () => {
    expect(renderMessage("order-shipped-customer", { order })).toContain("#5 is on its way")
    expect(renderMessage("order-delivered-customer", { order })).toContain("#5 has been delivered")
    expect(renderMessage("order-canceled-customer", { order })).toContain("#5 has been canceled")
    expect(renderMessage(TELEGRAM_START_HELP_TEMPLATE, {})).toContain("order confirmation page")
  })
})

describe("customer bot provider (per_recipient)", () => {
  const fetchMock = jest.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it("sends to the notification's chat, not a fixed one", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 7 } }),
    })
    const service = new TelegramNotificationProviderService(
      { logger },
      { bot_token: "123:TEST", per_recipient: true }
    )
    await service.send({
      to: "987654321",
      channel: "telegram_customer",
      template: "order-shipped-customer",
      data: { order: { display_id: 5 } },
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).chat_id).toEqual("987654321")
  })

  it("refuses a `to` that is not a chat ID", async () => {
    const service = new TelegramNotificationProviderService(
      { logger },
      { bot_token: "123:TEST", per_recipient: true }
    )
    await expect(
      service.send({
        to: "someone@example.com",
        channel: "telegram_customer",
        template: "order-shipped-customer",
        data: { order: { display_id: 5 } },
      })
    ).rejects.toThrow("No Telegram chat")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("still requires chat_id for the staff bot", () => {
    expect(() =>
      TelegramNotificationProviderService.validateOptions({ bot_token: "123:TEST" })
    ).toThrow("chat_id")
    expect(() =>
      TelegramNotificationProviderService.validateOptions({
        bot_token: "123:TEST",
        per_recipient: true,
      })
    ).not.toThrow()
  })
})
