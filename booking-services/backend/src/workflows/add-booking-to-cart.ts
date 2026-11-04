import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// TASKS P3-04 (BUILD_PLAN §6.3): put a booked time slot in a cart. The hold
// and the line item are created together: if adding the line item fails, the
// hold is deleted again, and if a later step fails, the nested
// addToCartWorkflow removes the line item (docs "Execute Another Workflow").
// One line item per booking, quantity 1 (one booking = one place, F-045);
// the booking is found again from the item through metadata.booking_id.

export type AddBookingToCartInput = {
  cart_id: string
  variant_id: string
  resource_id: string
  starts_at: string | Date
  ends_at: string | Date
  notes?: string | null
}

// Line item metadata keys the later booking hooks read (P3-05, P3-07).
export const BOOKING_ITEM_METADATA = {
  booking_id: "booking_id",
  resource_id: "booking_resource_id",
  starts_at: "booking_starts_at",
  ends_at: "booking_ends_at",
} as const

type Prepared = {
  cart_id: string
  customer_id: string | null
  variant_id: string
  resource_id: string
  // ISO strings: step outputs are serialized between steps, so a Date would
  // arrive in the next step as a string anyway.
  starts_at: string
  ends_at: string
  notes: string | null
}

// Checks before anything is written: the cart is open and the resource
// offers this service (link booking_resource ↔ product_variant, P3-02).
const prepareBookingStep = createStep(
  "prepare-booking",
  async (input: AddBookingToCartInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const {
      data: [cart],
    } = await query.graph({
      entity: "cart",
      fields: ["id", "customer_id", "completed_at"],
      filters: { id: input.cart_id },
    })
    if (!cart) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart ${input.cart_id} was not found.`)
    }
    if (cart.completed_at) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This cart is already checked out.")
    }

    const {
      data: [resource],
    } = await query.graph({
      entity: "booking_resource",
      fields: ["id", "is_active", "product_variants.id"],
      filters: { id: input.resource_id },
    })
    if (!resource) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Booking resource ${input.resource_id} was not found.`
      )
    }
    const offered = (resource.product_variants ?? []).some((v) => v?.id === input.variant_id)
    if (!offered) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This resource doesn't offer this service."
      )
    }

    const starts_at = new Date(input.starts_at)
    const ends_at = new Date(input.ends_at)
    if (Number.isNaN(starts_at.getTime()) || Number.isNaN(ends_at.getTime())) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "The booking times are not valid dates.")
    }

    const prepared: Prepared = {
      cart_id: cart.id,
      customer_id: cart.customer_id ?? null,
      variant_id: input.variant_id,
      resource_id: resource.id,
      starts_at: starts_at.toISOString(),
      ends_at: ends_at.toISOString(),
      notes: input.notes ?? null,
    }
    return new StepResponse(prepared)
  }
)

// The hold (P3-03 createHold, row-locked). Compensation deletes it.
const createBookingHoldStep = createStep(
  "create-booking-hold",
  async (input: Prepared, { container }) => {
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const hold = await booking.createHold({
      resource_id: input.resource_id,
      starts_at: new Date(input.starts_at),
      ends_at: new Date(input.ends_at),
      cart_id: input.cart_id,
      customer_id: input.customer_id,
      notes: input.notes,
    })
    return new StepResponse(hold, hold.id)
  },
  async (holdId, { container }) => {
    if (!holdId) {
      return
    }
    await container.resolve<BookingModuleService>(BOOKING_MODULE).deleteBookings(holdId)
  }
)

// Finds the line item the nested addToCartWorkflow created (it returns
// nothing) and stores its id on the hold. Compensation clears it again.
const attachLineItemToHoldStep = createStep(
  "attach-line-item-to-hold",
  async (input: { cart_id: string; booking_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [cart],
    } = await query.graph({
      entity: "cart",
      fields: ["id", "items.id", "items.metadata"],
      filters: { id: input.cart_id },
    })
    const item = (cart?.items ?? []).find(
      (i) => i?.metadata?.[BOOKING_ITEM_METADATA.booking_id] === input.booking_id
    )
    if (!item) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "The booking's line item was not found in the cart."
      )
    }
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const updated = await booking.updateBookings({ id: input.booking_id, line_item_id: item.id })
    return new StepResponse({ booking: updated, line_item_id: item.id }, input.booking_id)
  },
  async (bookingId, { container }) => {
    if (!bookingId) {
      return
    }
    await container
      .resolve<BookingModuleService>(BOOKING_MODULE)
      .updateBookings({ id: bookingId, line_item_id: null })
  }
)

export const addBookingToCartWorkflow = createWorkflow(
  "add-booking-to-cart",
  function (input: AddBookingToCartInput) {
    const prepared = prepareBookingStep(input)
    const hold = createBookingHoldStep(prepared)

    const cartInput = transform({ prepared, hold }, ({ prepared, hold }) => ({
      cart_id: prepared.cart_id,
      items: [
        {
          variant_id: prepared.variant_id,
          quantity: 1,
          metadata: {
            [BOOKING_ITEM_METADATA.booking_id]: hold.id,
            [BOOKING_ITEM_METADATA.resource_id]: prepared.resource_id,
            [BOOKING_ITEM_METADATA.starts_at]: prepared.starts_at,
            [BOOKING_ITEM_METADATA.ends_at]: prepared.ends_at,
          },
        },
      ],
    }))
    addToCartWorkflow.runAsStep({ input: cartInput })

    const attachInput = transform({ prepared, hold }, ({ prepared, hold }) => ({
      cart_id: prepared.cart_id,
      booking_id: hold.id,
    }))
    const result = attachLineItemToHoldStep(attachInput)

    return new WorkflowResponse(result)
  }
)
