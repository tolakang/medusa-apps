import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Tells the storefront to drop its cached catalog pages after a catalog change
// (TASKS P1-10). Medusa's recommended approach: "Revalidate Cache in Next.js
// Starter Storefront" (subscriber → storefront endpoint), plus a shared secret
// so only this backend can trigger it. The storefront also expires catalog
// data after 10 minutes, which covers changes without events (price lists).
// STOREFRONT_URL or REVALIDATE_SECRET unset = do nothing (dev, tests).
export default async function storefrontRevalidateHandler({
  event: { name },
  container,
}: SubscriberArgs<unknown>) {
  const storefrontUrl = process.env.STOREFRONT_URL
  const secret = process.env.REVALIDATE_SECRET
  if (!storefrontUrl || !secret) {
    return
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const response = await fetch(
      `${storefrontUrl.replace(/\/+$/, "")}/api/revalidate`,
      {
        method: "POST",
        headers: { "x-revalidate-secret": secret },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!response.ok) {
      logger.warn(`Storefront revalidate after ${name} returned ${response.status}.`)
    }
  } catch (e) {
    // The storefront may be redeploying; its 10-minute expiry catches up.
    logger.warn(`Storefront revalidate after ${name} failed: ${(e as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: [
    "product.created",
    "product.updated",
    "product.deleted",
    "product-variant.created",
    "product-variant.updated",
    "product-variant.deleted",
    "product-category.created",
    "product-category.updated",
    "product-category.deleted",
    "product-collection.created",
    "product-collection.updated",
    "product-collection.deleted",
    "region.created",
    "region.updated",
    "region.deleted",
  ],
}
