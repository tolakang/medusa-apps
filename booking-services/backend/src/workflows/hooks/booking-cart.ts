import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  addToCartWorkflow,
  completeCartWorkflow,
  updateLineItemInCartWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  bookingIdOf,
  bookingItemMismatch,
  bookingItemUpdateProblem,
  holdState,
  type BookingItemMetadata,
  type BookingRow,
} from "../../lib/booking-cart-rules"
import { BOOKING_MODULE } from "../../modules/booking"
import type BookingModuleService from "../../modules/booking/service"

// TASKS P3-05 (BUILD_PLAN §6.3): the cart hooks for bookings. All three only
// read and throw; none of them changes the cart (the completeCartWorkflow
// reference forbids mutating the cart in its validate hook).

type CartItemInput = {
  id?: string
  variant_id?: string | null
  quantity?: unknown
  metadata?: BookingItemMetadata
}

const refuse = (message: string): never => {
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, message)
}

async function cartItems(container: MedusaContainer, cartId: string): Promise<CartItemInput[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [cart],
  } = await query.graph({
    entity: "cart",
    fields: ["id", "items.id", "items.variant_id", "items.quantity", "items.metadata"],
    filters: { id: cartId },
  })
  return (cart?.items ?? []).filter(Boolean) as CartItemInput[]
}

// Variants that a booking resource offers (link P3-02) are services: they
// can only be in a cart with a booked time.
async function serviceVariantIds(
  container: MedusaContainer,
  variantIds: string[]
): Promise<Set<string>> {
  if (!variantIds.length) {
    return new Set()
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "booking_resources.id"],
    filters: { id: variantIds },
  })
  return new Set(data.filter((v) => (v.booking_resources ?? []).length > 0).map((v) => v.id))
}

// Checks booking items against their holds. `checkout` re-checks a hold that
// has run out: if nobody has taken the slot meanwhile, it still counts
// (the cart's own hold is ignored, so a retried completion stays valid).
async function assertBookingItems(
  container: MedusaContainer,
  cartId: string,
  items: CartItemInput[],
  { checkout }: { checkout: boolean }
) {
  const services = await serviceVariantIds(
    container,
    [...new Set(items.map((i) => i.variant_id).filter((v): v is string => !!v))]
  )
  const bookingIds = items.map((i) => bookingIdOf(i.metadata)).filter((id): id is string => !!id)

  for (const item of items) {
    if (item.variant_id && services.has(item.variant_id) && !bookingIdOf(item.metadata)) {
      refuse("Please choose a time to book this service.")
    }
    if (bookingIdOf(item.metadata) && item.quantity !== undefined && Number(item.quantity) !== 1) {
      refuse("A booking is for one place. Book another time to add more.")
    }
  }
  if (new Set(bookingIds).size !== bookingIds.length) {
    refuse("This booking is already in the cart.")
  }
  if (!bookingIds.length) {
    return
  }

  const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
  const rows = (await booking.listBookings({ id: bookingIds })) as unknown as BookingRow[]
  const byId = new Map(rows.map((b) => [b.id, b]))
  const now = new Date()

  for (const item of items) {
    const id = bookingIdOf(item.metadata)
    if (!id) {
      continue
    }
    const row = byId.get(id)
    const mismatch = bookingItemMismatch(item.metadata, row, cartId)
    if (mismatch) {
      refuse(mismatch)
    }
    const state = holdState(row!, now)
    if (state === "released") {
      refuse("This booking was released. Please choose the time again.")
    }
    if (state === "expired_hold") {
      const check = await booking.checkSlot({
        resource_id: row!.resource_id,
        starts_at: new Date(row!.starts_at),
        ends_at: new Date(row!.ends_at),
        ignore_cart_id: cartId,
        now,
      })
      if (!check.available) {
        refuse(
          checkout
            ? "Your hold on this time ran out and the time was taken. Please choose another time."
            : "This time is no longer available."
        )
      }
    }
  }
}

// Adding to the cart: new items must be valid bookings (or not services),
// and a booking can't be added twice.
addToCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const existing = await cartItems(container, input.cart_id)
  const added = (input.items ?? []) as CartItemInput[]
  const existingIds = new Set(existing.map((i) => bookingIdOf(i.metadata)).filter(Boolean))
  for (const item of added) {
    const id = bookingIdOf(item.metadata)
    if (id && existingIds.has(id)) {
      refuse("This booking is already in the cart.")
    }
  }
  await assertBookingItems(container, input.cart_id, added, { checkout: false })
})

// Changing an item: a booking stays one place with its booked time.
updateLineItemInCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const items = await cartItems(container, input.cart_id)
  const item = items.find((i) => i.id === input.item_id)
  if (!item) {
    return
  }
  const problem = bookingItemUpdateProblem(item.metadata, {
    quantity: input.update?.quantity,
    metadata: input.update?.metadata as BookingItemMetadata,
  })
  if (problem) {
    refuse(problem)
  }
})

// Completing the cart (read-only, idempotent on retry): every booking item
// still has its slot, and no service is in the cart without a booking.
completeCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const items = await cartItems(container, input.id)
  await assertBookingItems(container, input.id, items, { checkout: true })
})
