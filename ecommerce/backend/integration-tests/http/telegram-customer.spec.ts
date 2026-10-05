import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow } from "@medusajs/medusa/core-flows"
import telegramCustomerUpdates, {
  config as subscriberConfig,
} from "../../src/subscribers/telegram-customer-updates"
import { notifyOrderStatusWorkflow } from "../../src/workflows/telegram-customer"

// Customer order updates on Telegram (TASKS P1-17). The route and webhook read
// these at request time. No TELEGRAM_CUSTOMER_BOT_TOKEN, so the
// "telegram_customer" channel goes to notification-local (logs only).
process.env.TELEGRAM_CUSTOMER_BOT_USERNAME = "example_shop_bot"
process.env.TELEGRAM_CUSTOMER_WEBHOOK_SECRET = "test_webhook_secret"
jest.setTimeout(120 * 1000)

const CHAT_ID = 987654321

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Telegram customer updates (TASKS P1-17)", () => {
      const setup = async () => {
        const container = getContainer()
        await createDefaultsWorkflow(container).run()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const {
          data: [key],
        } = await query.graph({
          entity: "api_key",
          fields: ["token"],
          filters: { type: "publishable" },
        })
        const [order] = await container.resolve(Modules.ORDER).createOrders([
          {
            currency_code: "usd",
            items: [{ title: "Medusa Shorts", variant_title: "L", quantity: 1, unit_price: 15 }],
            shipping_address: {
              first_name: "Test",
              address_1: "Sihanouk Blvd",
              city: "Lvea Aem District",
              province: "Kandal",
              country_code: "kh",
              phone: "012 345 678",
            },
          },
        ])
        return { query, order, store: { headers: { "x-publishable-api-key": key.token } } }
      }

      const webhook = (text: string, secret = "test_webhook_secret") =>
        api
          .post(
            "/telegram/webhook",
            { update_id: 1, message: { text, chat: { id: CHAT_ID, type: "private" } } },
            { headers: { "x-telegram-bot-api-secret-token": secret } }
          )
          .catch((e) => e.response)

      const customerMessages = async (query, orderId?: string) => {
        const { data } = await query.graph({
          entity: "notification",
          fields: ["to", "template", "channel", "resource_id"],
          filters: { channel: "telegram_customer" },
        })
        return data
          .filter((n) => orderId === undefined || n.resource_id === orderId)
          .map((n) => [n.to, n.template])
      }

      it("links a chat from the order page button and sends the confirmation", async () => {
        const { query, order, store } = await setup()

        const { data } = await api.get(`/store/orders/${order.id}/telegram-link`, store)
        expect(data.url).toMatch(/^https:\/\/t\.me\/example_shop_bot\?start=[A-Za-z0-9_-]{1,64}$/)
        const payload = new URL(data.url).searchParams.get("start")!

        // Wrong secret: refused, nothing linked.
        expect((await webhook(`/start ${payload}`, "wrong")).status).toEqual(401)

        expect((await webhook(`/start ${payload}`)).status).toEqual(200)
        const { data: chats } = await query.graph({
          entity: "telegram_order_chat",
          fields: ["order_id", "chat_id"],
        })
        expect(chats).toEqual([{ order_id: order.id, chat_id: String(CHAT_ID) }])
        expect(await customerMessages(query, order.id)).toEqual([
          [String(CHAT_ID), "order-confirmed-customer"],
        ])

        // A second tap reuses the link and gets a short reply, not the whole
        // confirmation again.
        await webhook(`/start ${payload}`)
        const { data: again } = await query.graph({ entity: "telegram_order_chat", fields: ["id"] })
        expect(again).toHaveLength(1)
        expect((await customerMessages(query, order.id)).map(([, t]) => t).sort()).toEqual([
          "order-already-linked-customer",
          "order-confirmed-customer",
        ])
      })

      it("answers /start without a valid link with help, and links nothing", async () => {
        const { query } = await setup()
        expect((await webhook("/start")).status).toEqual(200)
        expect((await webhook("/start forged_AAAAAAAAAAAAAAAA")).status).toEqual(200)
        expect((await webhook("hello")).status).toEqual(200)

        const { data: chats } = await query.graph({ entity: "telegram_order_chat", fields: ["id"] })
        expect(chats).toEqual([])
        expect(await customerMessages(query)).toEqual([
          [String(CHAT_ID), "telegram-start-help"],
          [String(CHAT_ID), "telegram-start-help"],
        ])
      })

      it("tells the staff group and linked chats when the order is canceled, once", async () => {
        const { query, order, store } = await setup()
        const { data } = await api.get(`/store/orders/${order.id}/telegram-link`, store)
        await webhook(`/start ${new URL(data.url).searchParams.get("start")}`)

        expect(subscriberConfig.event).toEqual(
          expect.arrayContaining(["shipment.created", "delivery.created", "order.canceled"])
        )
        const event = { name: "order.canceled", data: { id: order.id } }
        await telegramCustomerUpdates({ event, container: getContainer() } as never)
        await telegramCustomerUpdates({ event, container: getContainer() } as never)

        const templates = (await customerMessages(query, order.id)).map(([, t]) => t)
        expect(templates.sort()).toEqual(["order-canceled-customer", "order-confirmed-customer"])
        const { data: staff } = await query.graph({
          entity: "notification",
          fields: ["to", "template"],
          filters: { channel: "telegram", resource_id: order.id },
        })
        expect(staff.map((n) => [n.to, n.template])).toEqual([["staff", "order-canceled-staff"]])
      })

      it("still tells staff when the customer must not be notified", async () => {
        const { query, order, store } = await setup()
        const { data } = await api.get(`/store/orders/${order.id}/telegram-link`, store)
        await webhook(`/start ${new URL(data.url).searchParams.get("start")}`)
        await notifyOrderStatusWorkflow(getContainer()).run({
          input: { order_id: order.id, status: "shipped", notify_customer: false },
        })
        const { data: sent } = await query.graph({
          entity: "notification",
          fields: ["channel", "template"],
          filters: { resource_id: order.id },
        })
        const templates = sent.map((n) => `${n.channel}:${n.template}`).sort()
        expect(templates).toEqual([
          "telegram:order-shipped-staff",
          "telegram_customer:order-confirmed-customer",
        ])
      })

      it("tells staff and customers about each parcel of an order, once each", async () => {
        const { query, order, store } = await setup()
        const { data } = await api.get(`/store/orders/${order.id}/telegram-link`, store)
        await webhook(`/start ${new URL(data.url).searchParams.get("start")}`)
        const shipped = (fulfillment_id: string) =>
          notifyOrderStatusWorkflow(getContainer()).run({
            input: { order_id: order.id, status: "shipped", notify_customer: true, fulfillment_id },
          })
        await shipped("ful_parcel_1")
        await shipped("ful_parcel_1") // the same event again: no second message
        await shipped("ful_parcel_2")

        const { data: sent } = await query.graph({
          entity: "notification",
          fields: ["channel", "template"],
          filters: { resource_id: order.id },
        })
        const count = (key: string) =>
          sent.filter((n) => `${n.channel}:${n.template}` === key).length
        expect(count("telegram:order-shipped-staff")).toEqual(2)
        expect(count("telegram_customer:order-shipped-customer")).toEqual(2)
      })

      it("keeps one link when Start is tapped twice at the same moment", async () => {
        const { query, order, store } = await setup()
        const { data } = await api.get(`/store/orders/${order.id}/telegram-link`, store)
        const start = `/start ${new URL(data.url).searchParams.get("start")}`
        const replies = await Promise.all([webhook(start), webhook(start), webhook(start)])
        expect(replies.map((r) => r.status)).toEqual([200, 200, 200])

        const { data: chats } = await query.graph({ entity: "telegram_order_chat", fields: ["id"] })
        expect(chats).toHaveLength(1)
        // Every tap is answered: one confirmation, the rest "already linked".
        const templates = (await customerMessages(query, order.id)).map(([, t]) => t)
        expect(templates.filter((t) => t === "order-confirmed-customer")).toHaveLength(1)
        expect(templates).toHaveLength(3)
      })

      it("does nothing for an unknown fulfillment", async () => {
        const { query } = await setup()
        await telegramCustomerUpdates({
          event: { name: "shipment.created", data: { id: "ful_unknown" } },
          container: getContainer(),
        } as never)
        expect(await customerMessages(query)).toEqual([])
      })
    })
  },
})
