import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { authEmailKey, PASSWORD_CHANGED_TEMPLATE, storefrontLink } from "../lib/auth-email"
import { sendAuthEmailWorkflow } from "./send-auth-email"

// Change password while signed in (owner, 2026-10-06; TASKS P1-18). Medusa's
// store API has no such route, so this uses the Auth Module's own methods
// (docs "Auth Module" reference: `authenticate`, `updateProvider`):
// 1. find the signed-in identity's emailpass login (its entity_id is the
//    login email; @medusajs/auth-emailpass `update` looks the identity up by
//    it, not by the actor ID the reference example shows);
// 2. check the current password with `authenticate`, and that it is this
//    same identity;
// 3. set the new one with `updateProvider`.
// No compensation: a changed password can't be put back (the old hash is gone).

type Input = { auth_identity_id: string; current_password: string; new_password: string }

export const WRONG_CURRENT_PASSWORD = "The current password is incorrect."

const changePasswordStep = createStep(
  "change-password",
  async (input: Input, { container }) => {
    const auth = container.resolve(Modules.AUTH)
    const identity = await auth.retrieveAuthIdentity(input.auth_identity_id, {
      relations: ["provider_identities"],
    })
    const login = identity.provider_identities?.find((p) => p.provider === "emailpass")
    if (!login) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This account signs in without a password."
      )
    }
    const email = login.entity_id

    const check = await auth.authenticate("emailpass", {
      body: { email, password: input.current_password },
    })
    if (!check.success || check.authIdentity?.id !== identity.id) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, WRONG_CURRENT_PASSWORD)
    }

    const updated = await auth.updateProvider("emailpass", {
      entity_id: email,
      password: input.new_password,
    })
    if (!updated.success) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        updated.error ?? "The password could not be changed."
      )
    }
    const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
    return new StepResponse({ email, forgot_url: storefrontLink(config, "forgot-password", {}) })
  }
)

export const changePasswordWorkflow = createWorkflow(
  "change-password",
  function (input: Input) {
    const changed = changePasswordStep(input)
    // Tell the account owner, so a change they didn't make doesn't go
    // unnoticed; the link leads to "Forgot password?" to take it back.
    const notice = transform({ changed }, ({ changed }) => ({
      to: changed.email,
      template: PASSWORD_CHANGED_TEMPLATE,
      data: { url: changed.forgot_url ?? "" },
      idempotency_key: authEmailKey("password-changed", `${changed.email}:${Date.now()}`),
    }))
    sendAuthEmailWorkflow.runAsStep({ input: notice })
    return new WorkflowResponse({ success: true })
  }
)
