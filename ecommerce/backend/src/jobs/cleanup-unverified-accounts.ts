import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cleanupUnverifiedAccountsWorkflow, retentionDays } from "../workflows/cleanup-unverified-accounts"

// Daily at 20:00 UTC = 03:00 Cambodia, on the worker (TASKS P1-21). The count
// is logged: a sudden jump means bots are signing up.
export default async function cleanupUnverifiedAccounts(container: MedusaContainer) {
  const days = retentionDays()
  const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { result } = await cleanupUnverifiedAccountsWorkflow(container).run({ input: { before } })
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(`Unverified sign-ups older than ${days} days: removed ${result.deleted} (checked ${result.checked}).`)
}

export const config = {
  name: "cleanup-unverified-accounts",
  schedule: "0 20 * * *",
}
