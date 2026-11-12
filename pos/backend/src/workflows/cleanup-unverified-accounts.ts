import { Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

// Removes sign-ups that never verified their email (owner, 2026-10-06; TASKS
// P1-21). Medusa expires verification codes but never deletes these. An
// identity is removed when ALL hold:
// - created more than UNVERIFIED_ACCOUNT_RETENTION_DAYS ago (default 28);
// - it signs in with email + password only (emailpass);
// - it never became a customer or admin user (no `*_id` in app_metadata);
// - none of its email verifications was confirmed.
// Deleted through the Auth Module (`deleteAuthIdentities`), which also
// deletes the provider identities, verifications and reset tokens
// (@medusajs/auth AuthIdentity cascades). At most MAX_PER_RUN per run.
// Identities are read oldest first, PAGE_SIZE at a time, until MAX_PER_RUN
// abandoned ones are found or MAX_PAGES pages were read: reading only the
// 500 oldest stopped the job for good once 500 kept accounts (customers,
// admins) were older than the window (review 2, S8).

export const DEFAULT_RETENTION_DAYS = 28
export const MAX_PER_RUN = 500
export const PAGE_SIZE = 500
export const MAX_PAGES = 40

export function retentionDays(env: NodeJS.ProcessEnv = process.env): number {
  const days = Number(env.UNVERIFIED_ACCOUNT_RETENTION_DAYS)
  return Number.isInteger(days) && days > 0 ? days : DEFAULT_RETENTION_DAYS
}

type Candidate = {
  id: string
  app_metadata?: Record<string, unknown> | null
  provider_identities?: { provider: string }[] | null
  verifications?: { verified_at?: Date | string | null }[] | null
}

export function isAbandonedSignUp(identity: Candidate): boolean {
  const actorIds = Object.entries(identity.app_metadata ?? {}).filter(
    ([key, value]) => key.endsWith("_id") && !!value
  )
  const providers = identity.provider_identities ?? []
  const verified = (identity.verifications ?? []).some((v) => !!v.verified_at)
  return (
    actorIds.length === 0 &&
    providers.length > 0 &&
    providers.every((p) => p.provider === "emailpass") &&
    !verified
  )
}

const deleteAbandonedSignUpsStep = createStep(
  "delete-abandoned-sign-ups",
  // page_size: for tests (default PAGE_SIZE).
  async (input: { before: string; page_size?: number }, { container }) => {
    const auth = container.resolve(Modules.AUTH)
    const ids: string[] = []
    let checked = 0
    const pageSize = input.page_size ?? PAGE_SIZE
    for (let page = 0; page < MAX_PAGES && ids.length < MAX_PER_RUN; page++) {
      const candidates = (await auth.listAuthIdentities(
        // created_at is a column of every Medusa data model; the filter type
        // only lists id and provider_identities.
        { created_at: { $lt: new Date(input.before) } } as Parameters<typeof auth.listAuthIdentities>[0],
        {
          relations: ["provider_identities", "verifications"],
          skip: page * pageSize,
          take: pageSize,
          order: { created_at: "ASC", id: "ASC" },
        }
      )) as unknown as Candidate[]
      checked += candidates.length
      ids.push(...candidates.filter(isAbandonedSignUp).map((identity) => identity.id))
      if (candidates.length < pageSize) {
        break
      }
    }
    const toDelete = ids.slice(0, MAX_PER_RUN)
    if (toDelete.length) {
      await auth.deleteAuthIdentities(toDelete)
    }
    return new StepResponse({ deleted: toDelete.length, checked })
  }
)

export const cleanupUnverifiedAccountsWorkflow = createWorkflow(
  "cleanup-unverified-accounts",
  function (input: { before: string; page_size?: number }) {
    return new WorkflowResponse(deleteAbandonedSignUpsStep(input))
  }
)
