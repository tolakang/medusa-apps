import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"
import type MarketplaceModuleService from "../../modules/marketplace/service"

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

// A handle from the shop name: lowercase letters and digits joined by single
// hyphens ("Dara's Crafts" → "dara-s-crafts"). Empty if the name has none.
export const handleFromName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

export const VENDOR_HANDLE_TAKEN_MESSAGE =
  "This shop handle is taken. Choose another one."
export const VENDOR_EMAIL_TAKEN_MESSAGE =
  "This email already belongs to a vendor account."
export const NO_EMAIL_MESSAGE =
  "Sign-up needs an email and password registration (/auth/vendor/emailpass/register)."

export type CreateVendorInput = {
  auth_identity_id: string
  name: string
  handle?: string
  email?: string
  logo?: string | null
  admin: { first_name?: string | null; last_name?: string | null }
}

// The admin's email is the one the auth identity registered with (emailpass:
// provider identity entity_id), not one from the request body, so nobody can
// sign up under someone else's address (MEDUSA_SKILL §7).
const registeredEmailStep = createStep(
  "vendor-registered-email",
  async (authIdentityId: string, { container }) => {
    const identity = await container
      .resolve(Modules.AUTH)
      .retrieveAuthIdentity(authIdentityId, { relations: ["provider_identities"] })
    const email = identity.provider_identities?.find(
      (p) => p.provider === "emailpass"
    )?.entity_id
    if (!email) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NO_EMAIL_MESSAGE)
    }
    return new StepResponse(normalizeEmail(email))
  }
)

type CreateVendorStepInput = {
  name: string
  handle: string
  email: string
  logo?: string | null
  admin: { email: string; first_name?: string | null; last_name?: string | null }
}

// Creates the vendor (status `pending` until the admin approves it) and its
// first admin. Compensation deletes both (official Vendors example:
// createVendorStep + createVendorAdminStep).
const createVendorWithAdminStep = createStep(
  "create-vendor-with-admin",
  async (input: CreateVendorStepInput, { container }) => {
    const marketplace = container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
    const [takenHandle] = await marketplace.listVendors({ handle: input.handle })
    if (takenHandle) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, VENDOR_HANDLE_TAKEN_MESSAGE)
    }
    const [takenEmail] = await marketplace.listVendorAdmins({ email: input.admin.email })
    if (takenEmail) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, VENDOR_EMAIL_TAKEN_MESSAGE)
    }
    const vendor = await marketplace.createVendors({
      name: input.name,
      handle: input.handle,
      email: input.email,
      logo: input.logo ?? null,
      status: "pending",
    })
    const admin = await marketplace.createVendorAdmins({
      vendor_id: vendor.id,
      email: input.admin.email,
      first_name: input.admin.first_name ?? null,
      last_name: input.admin.last_name ?? null,
    })
    return new StepResponse({ vendor, admin }, { vendorId: vendor.id, adminId: admin.id })
  },
  async (created, { container }) => {
    if (!created) {
      return
    }
    const marketplace = container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
    await marketplace.deleteVendorAdmins(created.adminId)
    await marketplace.deleteVendors(created.vendorId)
  }
)

// Vendor sign-up (BUILD_PLAN §6.6, TASKS P6-03): POST /auth/vendor/emailpass/
// register, then POST /vendors with that registration token. The token's
// auth identity becomes the vendor admin (app_metadata.vendor_id = the
// vendor admin's id, as in the official Vendors example). The vendor waits
// for the admin's approval (status pending → active).
export const createVendorWorkflow = createWorkflow(
  "create-vendor",
  function (input: CreateVendorInput) {
    const email = registeredEmailStep(input.auth_identity_id)
    const data = transform({ input, email }, ({ input, email }) => ({
      name: input.name.trim(),
      handle: input.handle ?? handleFromName(input.name),
      // The shop's contact email; the admin's sign-in email unless given.
      email: input.email ? normalizeEmail(input.email) : email,
      logo: input.logo ?? null,
      admin: {
        email,
        first_name: input.admin.first_name ?? null,
        last_name: input.admin.last_name ?? null,
      },
    }))
    const created = createVendorWithAdminStep(data)
    setAuthAppMetadataStep({
      authIdentityId: input.auth_identity_id,
      actorType: "vendor",
      value: created.admin.id,
    })
    return new WorkflowResponse(created)
  }
)
