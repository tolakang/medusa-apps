import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// TASKS P5-06: what a seller may offer. "Your products" (plan §6.5) are the
// published products of your own channel, the store's default sales
// channel; the seller picks which of them show in their channel (P5-02).

export async function sellerChannelId(container: MedusaContainer, sellerId: string) {
  const {
    data: [seller],
  } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "seller",
    fields: ["id", "sales_channel.id"],
    filters: { id: sellerId },
  })
  const channelId = seller?.sales_channel?.id
  if (!channelId) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "This seller has no sales channel. Ask the shop to set it up."
    )
  }
  return channelId
}

/** Your published products, each with whether it is in the seller's channel. */
export async function sellerCatalog(container: MedusaContainer, channelId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [store],
  } = await query.graph({ entity: "store", fields: ["default_sales_channel_id"] })
  const ownChannel = store?.default_sales_channel_id
  if (!ownChannel) {
    return []
  }
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "thumbnail", "sales_channels.id"],
    filters: { status: "published" },
  })
  return products
    .filter((product) =>
      (product.sales_channels ?? []).some((channel) => channel?.id === ownChannel)
    )
    .map((product) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      thumbnail: product.thumbnail,
      selected: (product.sales_channels ?? []).some((channel) => channel?.id === channelId),
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
}
