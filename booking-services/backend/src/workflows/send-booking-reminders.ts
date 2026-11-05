import type { CreateNotificationDTO } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { sendNotificationsStep } from "@medusajs/medusa/core-flows"
import { BOOKING_REMINDER_TEMPLATE, type BookingReminderData } from "../lib/booking-reminder"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// TASKS P3-09 (BUILD_PLAN §6.3): remind customers 24 hours before their
// booking. Run every 15 minutes by src/jobs/send-booking-reminders.ts.
// A confirmed booking that starts within the next `window_hours` and has no
// reminder_sent_at gets one email (channel "email", Resend). Bookings are
// marked first (compensation clears the mark), then the emails go out last;
// each carries idempotency_key booking_reminder_<id>, so the notification
// module never sends the same reminder twice, even after a retry. Customers
// without an email are marked too (nothing to send; the shop sees them in
// the admin calendar, P3-11).

type DueReminder = { booking_id: string; email: string | null; data: BookingReminderData }

const findDueRemindersStep = createStep(
  "find-due-reminders",
  async (input: { now?: string; window_hours?: number; limit?: number }, { container }) => {
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const now = input.now ? new Date(input.now) : new Date()
    const until = new Date(now.getTime() + (input.window_hours ?? 24) * 3600 * 1000)

    const due = await booking.listBookings(
      {
        status: "confirmed",
        reminder_sent_at: null,
        starts_at: { $gt: now, $lte: until },
      },
      { relations: ["resource"], take: input.limit ?? 200, order: { starts_at: "ASC" } }
    )
    const customerIds = [...new Set(due.map((b) => b.customer_id).filter((id): id is string => !!id))]
    type Customer = { id: string; email: string | null; first_name: string | null; last_name: string | null }
    const byId = new Map<string, Customer>()
    // An empty id filter would match every customer, so only query with ids.
    if (customerIds.length) {
      const { data } = await query.graph({
        entity: "customer",
        fields: ["id", "email", "first_name", "last_name"],
        filters: { id: customerIds },
      })
      for (const c of data) {
        byId.set(c.id, c as Customer)
      }
    }

    const reminders: DueReminder[] = due.map((b) => {
      const customer = b.customer_id ? byId.get(b.customer_id) : undefined
      return {
        booking_id: b.id,
        email: customer?.email ?? null,
        data: {
          booking: {
            id: b.id,
            starts_at: new Date(b.starts_at).toISOString(),
            ends_at: new Date(b.ends_at).toISOString(),
            timezone: b.resource.timezone,
            resource_name: b.resource.name,
            customer_name: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || null,
          },
        },
      }
    })
    return new StepResponse({ reminders, now: now.toISOString() })
  }
)

const markRemindersSentStep = createStep(
  "mark-reminders-sent",
  async (input: { ids: string[]; at: string }, { container }) => {
    if (!input.ids.length) {
      return new StepResponse(0, [] as string[])
    }
    await container
      .resolve<BookingModuleService>(BOOKING_MODULE)
      .updateBookings(input.ids.map((id) => ({ id, reminder_sent_at: new Date(input.at) })))
    return new StepResponse(input.ids.length, input.ids)
  },
  async (ids, { container }) => {
    if (!ids?.length) {
      return
    }
    await container
      .resolve<BookingModuleService>(BOOKING_MODULE)
      .updateBookings(ids.map((id) => ({ id, reminder_sent_at: null })))
  }
)

export const sendBookingRemindersWorkflow = createWorkflow(
  "send-booking-reminders",
  function (input: { now?: string; window_hours?: number; limit?: number }) {
    const found = findDueRemindersStep(input)

    const mark = transform({ found }, ({ found }) => ({
      ids: found.reminders.map((r) => r.booking_id),
      at: found.now,
    }))
    markRemindersSentStep(mark)

    const notifications = transform({ found }, ({ found }): CreateNotificationDTO[] =>
      found.reminders
        .filter((r) => !!r.email)
        .map((r) => ({
          to: r.email!,
          channel: "email",
          template: BOOKING_REMINDER_TEMPLATE,
          data: r.data,
          resource_id: r.booking_id,
          resource_type: "booking",
          trigger_type: "booking.reminder",
          idempotency_key: `booking_reminder_${r.booking_id}`,
        }))
    )
    sendNotificationsStep(notifications)

    const result = transform({ found, notifications }, ({ found, notifications }) => ({
      due: found.reminders.length,
      emailed: notifications.length,
      no_email: found.reminders.length - notifications.length,
    }))
    return new WorkflowResponse(result)
  }
)
