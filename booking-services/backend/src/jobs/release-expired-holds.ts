import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { releaseExpiredHoldsWorkflow } from "../workflows/release-expired-holds"

// TASKS P3-09: every minute, expired booking holds are released.
export default async function releaseExpiredHolds(container: MedusaContainer) {
  const { result } = await releaseExpiredHoldsWorkflow(container).run({ input: {} })
  if (result.length) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .info(`Released ${result.length} expired booking hold(s).`)
  }
}

export const config = {
  name: "release-expired-booking-holds",
  schedule: "* * * * *",
}
