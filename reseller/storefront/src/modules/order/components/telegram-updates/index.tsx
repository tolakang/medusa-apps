import { retrieveOrderTelegramLink } from "@lib/data/orders"
import { KH_COUNTRY_CODE } from "@lib/util/kh-locations"
import { HttpTypes } from "@medusajs/types"
import { Text } from "@modules/common/components/ui"

// "Get order updates on Telegram" (TASKS P1-17). Telegram bots cannot message
// a customer first, so the customer opens the shop's bot and taps Start; the
// bot then sends the order confirmation and later shipping and delivery news.
// Cambodian orders only, and only when the backend has the bot set up.
export default async function TelegramUpdates({
  order,
}: {
  order: HttpTypes.StoreOrder
}) {
  if (order.shipping_address?.country_code !== KH_COUNTRY_CODE) {
    return null
  }
  const url = await retrieveOrderTelegramLink(order.id)
  if (!url) {
    return null
  }

  return (
    <div
      className="flex flex-col gap-y-2 rounded-rounded border border-ui-border-base p-4"
      data-testid="telegram-updates"
    >
      <Text className="txt-medium-plus text-ui-fg-base">
        Get order updates on Telegram
      </Text>
      <Text className="txt-medium text-ui-fg-subtle">
        Open our Telegram bot and tap Start. We will send this order
        confirmation and tell you when your order ships.
      </Text>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start rounded-md bg-[#229ED9] px-4 py-2 txt-compact-medium-plus text-white hover:opacity-90"
        data-testid="telegram-updates-button"
      >
        Open in Telegram
      </a>
    </div>
  )
}
