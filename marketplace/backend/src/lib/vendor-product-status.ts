import { MedusaError } from "@medusajs/framework/utils"

// MARKETPLACE_REQUIRE_PRODUCT_APPROVAL (BUILD_PLAN §6.6, TASKS P6-04): on
// unless set to "false". With it on, a vendor's product stays unpublished
// until the marketplace publishes it (admin product moderation, P6-07).
export function productApprovalRequired(env: NodeJS.ProcessEnv = process.env) {
  return (env.MARKETPLACE_REQUIRE_PRODUCT_APPROVAL ?? "").trim().toLowerCase() !== "false"
}

export const VENDOR_PRODUCT_NEEDS_APPROVAL_MESSAGE =
  "Products are published by the marketplace after review. Save it as draft or proposed."

const VENDOR_STATUSES = ["draft", "proposed", "published"] as const
export type VendorProductStatus = (typeof VENDOR_STATUSES)[number]

// The status a vendor's new product gets (F-075): `draft` unless the vendor
// asks for another; with approval required, `published` is refused and
// `proposed` marks it ready for review. A vendor never sets `rejected`.
export function vendorProductStatus(
  requested: unknown,
  approvalRequired: boolean
): VendorProductStatus {
  if (requested === undefined || requested === null) {
    return "draft"
  }
  if (!VENDOR_STATUSES.includes(requested as VendorProductStatus)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `A vendor's product status is one of: ${VENDOR_STATUSES.join(", ")}.`
    )
  }
  if (requested === "published" && approvalRequired) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, VENDOR_PRODUCT_NEEDS_APPROVAL_MESSAGE)
  }
  return requested as VendorProductStatus
}
