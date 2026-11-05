import type { LinkDefinition } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createRemoteLinkStep, dismissRemoteLinkStep } from "@medusajs/medusa/core-flows"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"
import { isValidTimeZone } from "../modules/booking/utils/slot"

// TASKS P3-11 (BUILD_PLAN §6.3): admins set up what can be booked: a
// resource, its weekly hours and the services (product variants) it offers
// (link P3-02). Used by /admin/booking/resources.

export type ResourceType = "staff" | "room" | "equipment" | "venue"
export type WeeklyHoursInput = { weekday: number; start_time: string; end_time: string }

export type CreateBookingResourceInput = {
  name: string
  type: ResourceType
  capacity?: number
  timezone?: string
  is_active?: boolean
  schedules?: WeeklyHoursInput[]
  variant_ids?: string[]
}

export type UpdateBookingResourceInput = {
  id: string
  name?: string
  type?: ResourceType
  capacity?: number
  timezone?: string
  is_active?: boolean
  // Replace all weekly hours / offered services when given.
  schedules?: WeeklyHoursInput[]
  variant_ids?: string[]
}

// BOOKING_DEFAULT_TIMEZONE is the default for new resources (F-045).
export const defaultTimezone = () => process.env.BOOKING_DEFAULT_TIMEZONE || "UTC"

const assertTimezone = (tz: string | undefined) => {
  if (tz !== undefined && !isValidTimeZone(tz)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Unknown time zone "${tz}".`)
  }
}

const assertVariantsExist = async (container: { resolve: (k: string) => unknown }, ids: string[] | undefined) => {
  if (!ids?.length) {
    return
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (q: object) => Promise<{ data: { id: string }[] }>
  }
  const { data } = await query.graph({ entity: "product_variant", fields: ["id"], filters: { id: ids } })
  const found = new Set(data.map((v) => v.id))
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Variant ${missing[0]} was not found.`)
  }
}

const createResourceStep = createStep(
  "create-resource",
  async (input: CreateBookingResourceInput, { container }) => {
    const timezone = input.timezone ?? defaultTimezone()
    assertTimezone(timezone)
    await assertVariantsExist(container, input.variant_ids)
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const resource = await booking.createBookingResources({
      name: input.name,
      type: input.type,
      capacity: input.capacity ?? 1,
      timezone,
      is_active: input.is_active ?? true,
    })
    if (input.schedules?.length) {
      await booking.createBookingSchedules(
        input.schedules.map((h) => ({ ...h, resource_id: resource.id }))
      )
    }
    return new StepResponse(resource, resource.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    // Cascades to its weekly hours (P3-01).
    await container.resolve<BookingModuleService>(BOOKING_MODULE).deleteBookingResources(id)
  }
)

const variantLinks = (resourceId: string, variantIds: string[]): LinkDefinition[] =>
  variantIds.map((product_variant_id) => ({
    [BOOKING_MODULE]: { booking_resource_id: resourceId },
    [Modules.PRODUCT]: { product_variant_id },
  }))

export const createBookingResourceWorkflow = createWorkflow(
  "create-booking-resource",
  function (input: CreateBookingResourceInput) {
    const resource = createResourceStep(input)
    const links = transform({ resource, input }, ({ resource, input }) =>
      variantLinks(resource.id, input.variant_ids ?? [])
    )
    createRemoteLinkStep(links)
    return new WorkflowResponse(resource)
  }
)

type ResourceSnapshot = {
  id: string
  name: string
  type: ResourceType
  capacity: number
  timezone: string
  is_active: boolean
  schedules: WeeklyHoursInput[] | null
}

const updateResourceStep = createStep(
  "update-resource",
  async (input: UpdateBookingResourceInput, { container }) => {
    assertTimezone(input.timezone)
    await assertVariantsExist(container, input.variant_ids)
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const [current] = await booking.listBookingResources({ id: input.id }, { relations: ["schedules"] })
    if (!current) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Booking resource ${input.id} was not found.`)
    }
    const snapshot: ResourceSnapshot = {
      id: current.id,
      name: current.name,
      type: current.type as ResourceType,
      capacity: current.capacity,
      timezone: current.timezone,
      is_active: current.is_active,
      schedules: input.schedules
        ? (current.schedules ?? []).map((h) => ({ weekday: h.weekday, start_time: h.start_time, end_time: h.end_time }))
        : null,
    }
    const { schedules, variant_ids: _variants, id, ...fields } = input
    if (Object.keys(fields).length) {
      await booking.updateBookingResources({ id, ...fields })
    }
    if (schedules) {
      const old = (current.schedules ?? []).map((h) => h.id)
      if (old.length) {
        await booking.deleteBookingSchedules(old)
      }
      if (schedules.length) {
        await booking.createBookingSchedules(schedules.map((h) => ({ ...h, resource_id: id })))
      }
    }
    return new StepResponse({ id }, snapshot)
  },
  async (snapshot, { container }) => {
    if (!snapshot) {
      return
    }
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const { schedules, ...fields } = snapshot
    await booking.updateBookingResources(fields)
    if (schedules) {
      const now = await booking.listBookingSchedules({ resource_id: snapshot.id })
      if (now.length) {
        await booking.deleteBookingSchedules(now.map((h) => h.id))
      }
      if (schedules.length) {
        await booking.createBookingSchedules(schedules.map((h) => ({ ...h, resource_id: snapshot.id })))
      }
    }
  }
)

// Which offered services change: computed before the update so the link
// steps can add and remove exactly the difference.
const diffServicesStep = createStep(
  "diff-services",
  async (input: UpdateBookingResourceInput, { container }) => {
    if (!input.variant_ids) {
      return new StepResponse({ add: [] as LinkDefinition[], remove: [] as LinkDefinition[] })
    }
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [resource],
    } = await query.graph({
      entity: "booking_resource",
      fields: ["id", "product_variants.id"],
      filters: { id: input.id },
    })
    const current = new Set((resource?.product_variants ?? []).map((v) => v?.id).filter((v): v is string => !!v))
    const wanted = new Set(input.variant_ids)
    return new StepResponse({
      add: variantLinks(input.id, [...wanted].filter((v) => !current.has(v))),
      remove: variantLinks(input.id, [...current].filter((v) => !wanted.has(v))),
    })
  }
)

export const updateBookingResourceWorkflow = createWorkflow(
  "update-booking-resource",
  function (input: UpdateBookingResourceInput) {
    const diff = diffServicesStep(input)
    const updated = updateResourceStep(input)
    const remove = transform({ diff }, ({ diff }) => diff.remove)
    const add = transform({ diff }, ({ diff }) => diff.add)
    dismissRemoteLinkStep(remove)
    createRemoteLinkStep(add)
    return new WorkflowResponse(updated)
  }
)
