import type { Context } from "@medusajs/framework/types"
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex"
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils"
import { Booking } from "./models/booking"
import { BookingResource } from "./models/booking-resource"
import { BookingSchedule } from "./models/booking-schedule"
import { fitsWeeklyHours, isValidTimeZone, peakOverlap } from "./utils/slot"

export type BookingModuleOptions = {
  // Minutes a pending hold blocks its slot (BOOKING_HOLD_MINUTES, plan §6.3).
  holdMinutes?: number
}

export const DEFAULT_HOLD_MINUTES = 15

// Statuses that always take a place. `pending` takes one only while its hold
// hasn't expired; `cancelled` and `expired` never do.
const BLOCKING_STATUSES = ["pending", "confirmed", "completed", "no_show"]

export type SlotRequest = {
  resource_id: string
  starts_at: Date
  ends_at: Date
  // A cart's own hold doesn't count against itself, so a retried checkout
  // stays valid (plan §6.3, P3-05).
  ignore_cart_id?: string
  // For tests and jobs; defaults to the current time.
  now?: Date
}

export type SlotUnavailableReason =
  | "invalid_range"
  | "in_past"
  | "resource_not_found"
  | "resource_inactive"
  | "outside_hours"
  | "full"

export type SlotCheck =
  | { available: true; capacity: number; remaining: number }
  | { available: false; reason: SlotUnavailableReason; capacity: number; remaining: number }

export type ExtendedHold = {
  id: string
  previous_hold_expires_at: Date | null
  hold_expires_at: Date
}

export type CreateHoldInput = {
  resource_id: string
  starts_at: Date
  ends_at: Date
  cart_id?: string | null
  customer_id?: string | null
  line_item_id?: string | null
  notes?: string | null
  now?: Date
}

const REASON_MESSAGES: Record<SlotUnavailableReason, string> = {
  invalid_range: "The booking must end after it starts.",
  in_past: "This time has already passed.",
  resource_not_found: "This resource doesn't exist.",
  resource_inactive: "This resource isn't taking bookings.",
  outside_hours: "This time is outside the opening hours.",
  full: "This time is no longer available.",
}

export function slotUnavailableMessage(reason: SlotUnavailableReason): string {
  return REASON_MESSAGES[reason]
}

// TASKS P3-01 (data), P3-03 (isSlotAvailable, createHold).
class BookingModuleService extends MedusaService({
  BookingResource,
  BookingSchedule,
  Booking,
}) {
  protected options_: Required<BookingModuleOptions>

  constructor(container: Record<string, unknown>, options?: BookingModuleOptions) {
    super(...arguments)
    const minutes = Number(options?.holdMinutes)
    this.options_ = {
      holdMinutes: Number.isInteger(minutes) && minutes > 0 ? minutes : DEFAULT_HOLD_MINUTES,
    }
  }

  get holdMinutes(): number {
    return this.options_.holdMinutes
  }

  // Can a booking take one place of this resource from starts_at to ends_at?
  // Checks the resource is active, the slot fits its weekly hours (in its
  // time zone), and that the peak number of overlapping bookings stays below
  // its capacity. Pending holds count only until hold_expires_at.
  @InjectManager()
  async checkSlot(
    input: SlotRequest,
    @MedusaContext() sharedContext: Context<EntityManager> = {}
  ): Promise<SlotCheck> {
    return await this.checkSlot_(input, sharedContext)
  }

  @InjectManager()
  async isSlotAvailable(
    input: SlotRequest,
    @MedusaContext() sharedContext: Context<EntityManager> = {}
  ): Promise<boolean> {
    return (await this.checkSlot_(input, sharedContext)).available
  }

  // Creates a `pending` booking that holds the slot for holdMinutes. The
  // resource row is locked (SELECT ... FOR UPDATE) for the check and the
  // insert, so two holds for the last place never both succeed (P3-14).
  @InjectManager()
  async createHold(
    input: CreateHoldInput,
    @MedusaContext() sharedContext: Context<EntityManager> = {}
  ) {
    const id = await this.createHold_(input, sharedContext)
    return await this.retrieveBooking(id, {}, sharedContext)
  }

  @InjectTransactionManager()
  protected async createHold_(
    input: CreateHoldInput,
    @MedusaContext() sharedContext: Context<EntityManager> = {}
  ): Promise<string> {
    const now = input.now ?? new Date()
    await sharedContext.transactionManager!.execute(
      "SELECT id FROM booking_resource WHERE id = ? AND deleted_at IS NULL FOR UPDATE",
      [input.resource_id]
    )

    const check = await this.checkSlot_(
      { resource_id: input.resource_id, starts_at: input.starts_at, ends_at: input.ends_at, now },
      sharedContext
    )
    if (!check.available) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, slotUnavailableMessage(check.reason))
    }

    const hold = await this.createBookings(
      {
        resource_id: input.resource_id,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        status: "pending",
        hold_expires_at: new Date(now.getTime() + this.options_.holdMinutes * 60_000),
        cart_id: input.cart_id ?? null,
        customer_id: input.customer_id ?? null,
        line_item_id: input.line_item_id ?? null,
        notes: input.notes ?? null,
      },
      sharedContext
    )
    return hold.id
  }

  // Renews the pending holds of a cart when the customer starts paying
  // (TASKS P3-06), so a slow payment doesn't lose the slot halfway. Each hold
  // gets hold_expires_at = now + holdMinutes, but only if its slot is still
  // free when this cart's own holds are ignored: a hold that already ran out
  // and was taken by someone else stays as it is (checkout then refuses it,
  // P3-05). Resource rows are locked in id order, as in createHold.
  @InjectManager()
  async extendCartHolds(
    input: { cart_id: string; now?: Date },
    @MedusaContext() sharedContext: Context<EntityManager> = {}
  ): Promise<ExtendedHold[]> {
    return await this.extendCartHolds_(input, sharedContext)
  }

  @InjectTransactionManager()
  protected async extendCartHolds_(
    input: { cart_id: string; now?: Date },
    @MedusaContext() sharedContext: Context<EntityManager> = {}
  ): Promise<ExtendedHold[]> {
    const now = input.now ?? new Date()
    const until = new Date(now.getTime() + this.options_.holdMinutes * 60_000)
    const holds = await this.listBookings(
      { cart_id: input.cart_id, status: "pending" },
      { order: { resource_id: "ASC", starts_at: "ASC" } },
      sharedContext
    )
    const extended: ExtendedHold[] = []
    for (const hold of holds) {
      await sharedContext.transactionManager!.execute(
        "SELECT id FROM booking_resource WHERE id = ? AND deleted_at IS NULL FOR UPDATE",
        [hold.resource_id]
      )
      const previous = hold.hold_expires_at ? new Date(hold.hold_expires_at) : null
      if (previous && previous.getTime() >= until.getTime()) {
        continue
      }
      const check = await this.checkSlot_(
        {
          resource_id: hold.resource_id,
          starts_at: new Date(hold.starts_at),
          ends_at: new Date(hold.ends_at),
          ignore_cart_id: input.cart_id,
          now,
        },
        sharedContext
      )
      if (!check.available) {
        continue
      }
      await this.updateBookings({ id: hold.id, hold_expires_at: until }, sharedContext)
      extended.push({ id: hold.id, previous_hold_expires_at: previous, hold_expires_at: until })
    }
    return extended
  }

  @InjectTransactionManager()
  protected async checkSlot_(
    input: SlotRequest,
    @MedusaContext() sharedContext: Context<EntityManager> = {}
  ): Promise<SlotCheck> {
    const now = input.now ?? new Date()
    const starts = new Date(input.starts_at)
    const ends = new Date(input.ends_at)
    const no = (reason: SlotUnavailableReason, capacity = 0, remaining = 0): SlotCheck => ({
      available: false,
      reason,
      capacity,
      remaining,
    })

    if (!(starts.getTime() < ends.getTime())) {
      return no("invalid_range")
    }
    if (starts.getTime() < now.getTime()) {
      return no("in_past")
    }

    const [resource] = await this.listBookingResources(
      { id: input.resource_id },
      { relations: ["schedules"] },
      sharedContext
    )
    if (!resource) {
      return no("resource_not_found")
    }
    if (!resource.is_active) {
      return no("resource_inactive", resource.capacity)
    }
    if (!isValidTimeZone(resource.timezone)) {
      // Unknown zone: no hours can match, so the slot can't be offered.
      return no("outside_hours", resource.capacity)
    }
    if (!fitsWeeklyHours(starts, ends, resource.timezone, resource.schedules ?? [])) {
      return no("outside_hours", resource.capacity)
    }

    const overlapping = await this.listBookings(
      {
        resource_id: resource.id,
        status: BLOCKING_STATUSES as ("pending" | "confirmed" | "completed" | "no_show")[],
        starts_at: { $lt: ends },
        ends_at: { $gt: starts },
      },
      { select: ["id", "starts_at", "ends_at", "status", "hold_expires_at", "cart_id"] },
      sharedContext
    )
    const taking = overlapping.filter(
      (b) =>
        !(input.ignore_cart_id && b.cart_id === input.ignore_cart_id) &&
        !(
          b.status === "pending" &&
          b.hold_expires_at &&
          new Date(b.hold_expires_at).getTime() <= now.getTime()
        )
    )
    const used = peakOverlap(
      taking.map((b) => ({ starts_at: new Date(b.starts_at), ends_at: new Date(b.ends_at) })),
      starts,
      ends
    )
    const remaining = Math.max(resource.capacity - used, 0)
    return remaining > 0
      ? { available: true, capacity: resource.capacity, remaining }
      : no("full", resource.capacity, 0)
  }
}

export default BookingModuleService
