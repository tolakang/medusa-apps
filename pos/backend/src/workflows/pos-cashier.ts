import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"

// Cashier actor type (TASKS P2-03), from the docs guide "How to Create an
// Actor Type" with one change: registration is invite-only. The guide lets
// any registration token create an actor; here an admin first creates the
// cashier (create-pos-cashier), and the token's email must match that
// invitation (accept-pos-cashier-invite). Cashiers are never admin users.

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

type CreateCashierInput = { name: string; email: string }

const createPosCashierRecordStep = createStep(
  "create-pos-cashier-record",
  async (input: CreateCashierInput, { container }) => {
    const pos: PosModuleService = container.resolve(POS_MODULE)
    const email = normalizeEmail(input.email)
    const [existing] = await pos.listPosCashiers({ email })
    if (existing) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        `A cashier with the email ${email} already exists.`
      )
    }
    const cashier = await pos.createPosCashiers({ name: input.name.trim(), email })
    return new StepResponse(cashier, cashier.id)
  },
  async (cashierId: string | undefined, { container }) => {
    if (!cashierId) {
      return
    }
    const pos: PosModuleService = container.resolve(POS_MODULE)
    await pos.deletePosCashiers(cashierId)
  }
)

export const createPosCashierWorkflow = createWorkflow(
  "create-pos-cashier",
  function (input: CreateCashierInput) {
    const cashier = createPosCashierRecordStep(input)
    return new WorkflowResponse(cashier)
  }
)

export const NO_INVITATION_MESSAGE =
  "There is no active cashier invitation for this email. Ask the shop admin to add you."

// The active cashier invited with the email this auth identity registered
// (emailpass: provider identity entity_id = the email).
const findInvitedPosCashierStep = createStep(
  "find-invited-pos-cashier",
  async (input: { auth_identity_id: string }, { container }) => {
    const auth = container.resolve(Modules.AUTH)
    const identity = await auth.retrieveAuthIdentity(input.auth_identity_id, {
      relations: ["provider_identities"],
    })
    const email = identity.provider_identities?.find((p) => p.provider === "emailpass")?.entity_id
    const pos: PosModuleService = container.resolve(POS_MODULE)
    const [cashier] = email ? await pos.listPosCashiers({ email: normalizeEmail(email) }) : []
    if (!cashier || !cashier.is_active) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NO_INVITATION_MESSAGE)
    }
    return new StepResponse(cashier)
  }
)

// Links the auth identity to the cashier (app_metadata.cashier_id). The core
// step refuses an identity that already has a cashier and undoes itself if a
// later step fails.
export const acceptPosCashierInviteWorkflow = createWorkflow(
  "accept-pos-cashier-invite",
  function (input: { auth_identity_id: string }) {
    const cashier = findInvitedPosCashierStep(input)
    setAuthAppMetadataStep({
      authIdentityId: input.auth_identity_id,
      actorType: "cashier",
      value: cashier.id,
    })
    return new WorkflowResponse(cashier)
  }
)
