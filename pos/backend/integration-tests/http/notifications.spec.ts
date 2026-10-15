import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { notifyOrderPlacedWorkflow } from "../../src/workflows/notify-order-placed"
import orderPlacedHandler, { config } from "../../src/subscribers/order-placed"

// Runner: MEDUSA_SKILL.md §10. No RESEND_API_KEY / TELEGRAM_BOT_TOKEN in tests,
// so medusa-config.ts routes "email" and "telegram" to notification-local,
// which only logs (TASKS P1-04). The runner restores a DB snapshot before each
// test after the first, so each test creates its own order.
jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe("order placed notifications (TASKS P1-04)", () => {
      const createOrder = async (extra: { no_notification?: boolean } = {}) => {
        const orderService = getContainer().resolve(Modules.ORDER)
        const [order] = await orderService.createOrders([
          {
            email: "customer@example.com",
            currency_code: "usd",
            items: [{ title: "Medusa T-Shirt", quantity: 2, unit_price: 15 }],
            shipping_address: {
              first_name: "Dara",
              address_1: "St. 51",
              city: "Phnom Penh",
              country_code: "kh",
              phone: "+855 12 345 678",
            },
            ...extra,
          },
        ])
        return order
      }

      const notificationsFor = async (orderId: string) => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "notification",
          fields: ["channel", "status", "to", "template", "idempotency_key", "resource_id"],
          filters: { resource_id: orderId },
        })
        return data
          .map((n) => ({ channel: n.channel, status: n.status, to: n.to, key: n.idempotency_key }))
          .sort((a, b) => a.channel.localeCompare(b.channel))
      }

      it("sends one customer email and one staff alert, once, even when run again", async () => {
        const order = await createOrder()
        await notifyOrderPlacedWorkflow(getContainer()).run({ input: { id: order.id } })
        // A retried event must not send again.
        await notifyOrderPlacedWorkflow(getContainer()).run({ input: { id: order.id } })

        expect(await notificationsFor(order.id)).toEqual([
          {
            channel: "email",
            status: "success",
            to: "customer@example.com",
            key: `order-placed:email:${order.id}`,
          },
          {
            channel: "telegram",
            status: "success",
            to: "staff",
            key: `order-placed:telegram:${order.id}`,
          },
        ])
      })

      it("skips the customer email for an order with no_notification, but still alerts staff", async () => {
        const order = await createOrder({ no_notification: true })
        await notifyOrderPlacedWorkflow(getContainer()).run({ input: { id: order.id } })
        expect((await notificationsFor(order.id)).map((n) => n.channel)).toEqual(["telegram"])
      })

      it("runs from the order.placed subscriber", async () => {
        expect(config.event).toEqual("order.placed")
        const order = await createOrder()
        await orderPlacedHandler({
          event: { name: "order.placed", data: { id: order.id } },
          container: getContainer(),
        } as Parameters<typeof orderPlacedHandler>[0])
        expect((await notificationsFor(order.id)).map((n) => n.channel)).toEqual([
          "email",
          "telegram",
        ])
      })
    })
  },
})
