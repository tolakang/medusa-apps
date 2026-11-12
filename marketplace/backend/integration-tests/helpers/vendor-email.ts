import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

// Vendors confirm their sign-in email before they can sign in or be approved
// (review 2, A3). Tests that aren't about that confirm it through the Auth
// Module, as the emailed link would; vendor-auth.spec.ts tests the link.
export async function confirmVendorEmail(container: MedusaContainer, email: string) {
  const auth = container.resolve(Modules.AUTH)
  const [identity] = await auth.listProviderIdentities({ entity_id: email, provider: "emailpass" })
  const { code } = await auth.requestAuthVerification({
    entity_id: email,
    entity_type: "email",
    auth_identity_id: identity.auth_identity_id!,
    code_provider: "token",
  })
  await auth.confirmAuthVerification({ code: code! })
}
