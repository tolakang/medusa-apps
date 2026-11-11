import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows"
import { SELLER_MODULE } from "../../modules/seller"
import SellerModuleService from "../../modules/seller/service"
import { inviteCodeMatches } from "../../lib/invite-code"
import { normalizeEmail } from "./steps/create-seller"

export const NO_SELLER_INVITATION_MESSAGE =
  "There is no seller invitation for this email. Ask the shop to add you as a seller."
export const WRONG_SELLER_INVITE_CODE_MESSAGE =
  "This invite code isn't right. Ask the shop for the code of your invitation."

type AcceptSellerInviteInput = { auth_identity_id: string; invite_code: string }

// The seller the admin created with the email this auth identity registered
// (emailpass: provider identity entity_id = the email). TASKS P5-03, the
// invite-only pattern of POS cashiers (MEDUSA_SKILL §7, F-036).
const findInvitedSellerStep = createStep(
  "find-invited-seller",
  async (input: AcceptSellerInviteInput, { container }) => {
    const identity = await container
      .resolve(Modules.AUTH)
      .retrieveAuthIdentity(input.auth_identity_id, {
        relations: ["provider_identities"],
      })
    const email = identity.provider_identities?.find(
      (p) => p.provider === "emailpass"
    )?.entity_id
    const [seller] = email
      ? await container
          .resolve<SellerModuleService>(SELLER_MODULE)
          .listSellers({ email: normalizeEmail(email) })
      : []
    if (!seller || seller.status === "suspended") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NO_SELLER_INVITATION_MESSAGE)
    }
    // The email alone proves nothing (anyone can register it first), so the
    // code the shop gave with the invitation is needed too (REVIEW_FIXES B11).
    if (!inviteCodeMatches("seller", seller.id, input.invite_code)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, WRONG_SELLER_INVITE_CODE_MESSAGE)
    }
    return new StepResponse(seller)
  }
)

// Links the auth identity to the seller (app_metadata.seller_id). The core
// step refuses an identity that already has a seller and undoes itself if a
// later step fails.
export const acceptSellerInviteWorkflow = createWorkflow(
  "accept-seller-invite",
  function (input: AcceptSellerInviteInput) {
    const seller = findInvitedSellerStep(input)
    setAuthAppMetadataStep({
      authIdentityId: input.auth_identity_id,
      actorType: "seller",
      value: seller.id,
    })
    return new WorkflowResponse(seller)
  }
)
