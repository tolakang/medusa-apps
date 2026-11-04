import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, MedusaError, ProductStatus } from "@medusajs/framework/utils"
import { createProductOptionsWorkflow, createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { createBookingResourceWorkflow, defaultTimezone } from "../workflows/booking-resource"

// Demo booking data (TASKS P3-12): one service and one stylist, so a fresh
// shop can be tried end to end. `pnpm seed:booking-demo` after `pnpm seed`.
// Safe to re-run: it stops if the service already exists.
//
// A service is a product WITHOUT a shipping profile whose variants have
// manage_inventory: false, so its line items don't require shipping
// (docs "Configure Selling Products": no inventory item → the product's
// shipping profile decides; core-flows prepare-line-item-data). Each variant
// is one length; metadata.duration_minutes is the slot length the
// storefront asks for (GET /store/booking/slots defaults to it).
const HANDLE = "haircut"

export default async function seedBookingDemo({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: existing } = await query.graph({ entity: "product", fields: ["id"], filters: { handle: HANDLE } })
  if (existing.length) {
    logger.info(`Booking demo: product "${HANDLE}" already exists; nothing to seed.`)
    return
  }
  const {
    data: [store],
  } = await query.graph({ entity: "store", fields: ["default_sales_channel_id"] })
  if (!store?.default_sales_channel_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "The store has no default sales channel. Run `pnpm seed` first.")
  }

  const {
    result: [length],
  } = await createProductOptionsWorkflow(container).run({
    input: { product_options: [{ title: "Length", values: ["30 min", "60 min"] }] },
  })
  const {
    result: [product],
  } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Haircut",
          handle: HANDLE,
          description: "Cut and style with one of our stylists. Pick a time that suits you.",
          status: ProductStatus.PUBLISHED,
          // No shipping_profile_id: a service isn't shipped.
          options: [{ id: length.id }],
          sales_channels: [{ id: store.default_sales_channel_id }],
          variants: [
            {
              title: "30 min",
              sku: "HAIRCUT-30",
              manage_inventory: false,
              options: { Length: "30 min" },
              metadata: { duration_minutes: 30 },
              prices: [{ amount: 8, currency_code: "usd" }],
            },
            {
              title: "60 min",
              sku: "HAIRCUT-60",
              manage_inventory: false,
              options: { Length: "60 min" },
              metadata: { duration_minutes: 60 },
              prices: [{ amount: 15, currency_code: "usd" }],
            },
          ],
        },
      ],
    },
  })

  // Monday to Saturday, 09:00-12:00 and 13:00-17:00 in the shop's zone.
  const schedules = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
    { weekday, start_time: "09:00", end_time: "12:00" },
    { weekday, start_time: "13:00", end_time: "17:00" },
  ])
  const { result: stylist } = await createBookingResourceWorkflow(container).run({
    input: {
      name: "Sophea",
      type: "staff",
      timezone: defaultTimezone(),
      schedules,
      variant_ids: product.variants.map((v) => v.id),
    },
  })
  logger.info(`Booking demo: service "${product.title}" and stylist ${stylist.name} (${stylist.timezone}) created.`)
}
