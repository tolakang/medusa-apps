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

export const DEFAULT_RETENTION_DAYS = 28
export const MAX_PER_RUN = 500

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
  async (input: { before: string }, { container }) => {
    const auth = container.resolve(Modules.AUTH)
    const candidates = (await auth.listAuthIdentities(
      // created_at is a column of every Medusa data model; the filter type
      // only lists id and provider_identities.
      { created_at: { $lt: new Date(input.before) } } as Parameters<typeof auth.listAuthIdentities>[0],
      { relations: ["provider_identities", "verifications"], take: MAX_PER_RUN, order: { created_at: "ASC" } }
    )) as unknown as Candidate[]
    const ids = candidates.filter(isAbandonedSignUp).map((identity) => identity.id)
    if (ids.length) {
      await auth.deleteAuthIdentities(ids)
    }
    return new StepResponse({ deleted: ids.length, checked: candidates.length })
  }
)

export const cleanupUnverifiedAccountsWorkflow = createWorkflow(
  "cleanup-unverified-accounts",
  function (input: { before: string }) {
    return new WorkflowResponse(deleteAbandonedSignUpsStep(input))
  }
)
