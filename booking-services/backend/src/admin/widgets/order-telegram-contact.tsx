import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Text } from "@medusajs/ui"
import { TELEGRAM_CONTACT_KEY, telegramContactLabel } from "../../lib/telegram-contact"

// Shows the Telegram contact the customer gave at checkout (TASKS P1-16 step A)
// in the order's side column (zone from @medusajs/admin-shared 2.21.1). Staff
// message the customer from their own Telegram; nothing is sent automatically.

const OrderTelegramContactWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const telegram = telegramContactLabel(order.metadata?.[TELEGRAM_CONTACT_KEY])
  if (!telegram) {
    return null
  }

  return (
    <Container className="px-6 py-4">
      <Heading level="h2" className="mb-2">
        Customer Telegram
      </Heading>
      <Text size="small">
        {telegram.url ? (
          <a
            href={telegram.url}
            target="_blank"
            rel="noreferrer"
            className="text-ui-fg-interactive hover:underline"
          >
            {telegram.text}
          </a>
        ) : (
          telegram.text
        )}
      </Text>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderTelegramContactWidget
