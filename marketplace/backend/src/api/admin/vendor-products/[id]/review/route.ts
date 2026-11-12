import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import type { PostAdminVendorProductReviewType } from "../../validators"

export const NOT_A_VENDOR_PRODUCT_MESSAGE = "This product doesn't belong to a vendor."

// POST /admin/vendor-products/:id/review (TASKS P6-07): product moderation.
// `publish` makes a vendor's product public; `reject` marks it rejected (the
// vendor sees that in its product list). Same as setting the status in the
// product page, but only for vendors' products.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminVendorProductReviewType>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [product],
  } = await query.graph(
    { entity: "product", fields: ["id", "vendor.id"], filters: { id: req.params.id } },
    { throwIfKeyNotFound: true }
  )
  if (!product.vendor?.id) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NOT_A_VENDOR_PRODUCT_MESSAGE)
  }
  const status = req.validatedBody.action === "publish" ? "published" : "rejected"
  await updateProductsWorkflow(req.scope).run({
    input: { selector: { id: product.id }, update: { status } },
  })
  const {
    data: [updated],
  } = await query.graph({
    entity: "product",
    fields: ["id", "title", "status", "vendor.id", "vendor.name"],
    filters: { id: product.id },
  })
  res.json({ product: updated })
}
