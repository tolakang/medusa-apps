import TelegramNotificationProviderService, { TELEGRAM_API_URL } from "../service"
import type { Logger } from "@medusajs/framework/types"

// Fake token and chat only: fetch is mocked, nothing is sent (TASKS P1-04).
const options = { bot_token: "123:TEST_TOKEN", chat_id: "-1001234567890" }
const logger = { info: jest.fn(), error: jest.fn() } as unknown as Logger

const order = {
  display_id: 1001,
  email: "customer@example.com",
  currency_code: "usd",
  total: 16.5,
  items: [
    { title: "Medusa T-Shirt", variant_title: "L / White", quantity: 2, total: 30 },
    { title: "Gift card", variant_title: "Default variant", quantity: 1, total: 0 },
  ],
  shipping_address: { first_name: "Dara", phone: "+855 12 345 678", address_1: "St. 51", city: "Khan Chamkar Mon", province: "Phnom Penh" },
  shipping_methods: [{ name: "Phnom Penh Delivery" }],
}

describe("Telegram provider", () => {
  const fetchMock = jest.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it("posts the staff order alert to the configured chat", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    })
    const service = new TelegramNotificationProviderService({ logger }, options)

    const result = await service.send({
      to: "staff",
      channel: "telegram",
      template: "order-placed-staff",
      data: { order },
    })

    expect(result).toEqual({ id: "42" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toEqual(`${TELEGRAM_API_URL}/bot123:TEST_TOKEN/sendMessage`)
    const body = JSON.parse(init.body)
    expect(body.chat_id).toEqual("-1001234567890")
    expect(body.text).toContain("New order #1001 — $16.50")
    expect(body.text).toContain("• 2 × Medusa T-Shirt (L / White)\n")
    expect(body.text).toContain("• 1 × Gift card\n")
    expect(body.text).toContain("Phone: +855 12 345 678")
    expect(body.text).toContain("Address: St. 51, Khan Chamkar Mon, Phnom Penh")
    expect(body.text).toContain("Delivery: Phnom Penh Delivery")
  })

  it("throws with Telegram's description, never the token", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, description: "Bad Request: chat not found" }),
    })
    const service = new TelegramNotificationProviderService({ logger }, options)
    const error = await service
      .send({ to: "staff", channel: "telegram", template: "order-placed-staff", data: { order } })
      .catch((e: Error) => e)
    expect((error as Error).message).toEqual("Telegram returned 400: Bad Request: chat not found")
    expect((error as Error).message).not.toContain("TEST_TOKEN")
  })

  it("rejects missing options at startup", () => {
    expect(() => TelegramNotificationProviderService.validateOptions({ chat_id: "1" })).toThrow("bot_token")
    expect(() => TelegramNotificationProviderService.validateOptions({ bot_token: "1" })).toThrow("chat_id")
  })
})
