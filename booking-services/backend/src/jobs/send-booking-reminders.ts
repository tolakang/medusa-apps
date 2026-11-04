import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendBookingRemindersWorkflow } from "../workflows/send-booking-reminders"

// TASKS P3-09: every 15 minutes, email the customers whose booking starts in
// the next 24 hours (once per booking).
export default async function sendBookingReminders(container: MedusaContainer) {
  const { result } = await sendBookingRemindersWorkflow(container).run({ input: {} })
  if (result.due) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .info(`Booking reminders: ${result.emailed} emailed, ${result.no_email} without an email.`)
  }
}

export const config = {
  name: "send-booking-reminders",
  schedule: "*/15 * * * *",
}
