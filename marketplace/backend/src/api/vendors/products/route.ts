import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { CreateProductWorkflowInputDTO } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  productApprovalRequired,
  vendorProductStatus,
} from "../../../lib/vendor-product-status"
import { createVendorProductWorkflow } from "../../../workflows/marketplace/create-vendor-product"

// What a vendor sees of its products (fixed, no `?fields`).
export const VENDOR_PRODUCT_FIELDS = [
  "id",
  "title",
  "handle",
  "subtitle",
  "description",
  "status",
  "thumbnail",
  "created_at",
  "updated_at",
  "options.id",
  "options.title",
  "options.values.value",
  "variants.id",
  "variants.title",
  "variants.sku",
  "variants.manage_inventory",
  "variants.prices.amount",
  "variants.prices.currency_code",
]

const vendorProducts = async (req: AuthenticatedMedusaRequest, productIds?: string[]) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [admin],
  } = await query.graph({
    entity: "vendor_admin",
    fields: ["vendor.products.id"],
    filters: { id: req.auth_context.actor_id },
  })
  const own = (admin?.vendor?.products ?? []).map((p) => p!.id)
  const ids = productIds ? own.filter((id) => productIds.includes(id)) : own
  if (!ids.length) {
    return []
  }
  const { data } = await query.graph({
    entity: "product",
    fields: VENDOR_PRODUCT_FIELDS,
    filters: { id: ids },
    pagination: { order: { created_at: "DESC" } },
  })
  return data
}

// GET /vendors/products (TASKS P6-04): the signed-in vendor's products, newest
// first, any status.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const products = await vendorProducts(req)
  res.json({ products, count: products.length })
}

// POST /vendors/products (TASKS P6-04): a vendor adds a product (body as the
// admin's POST /admin/products, validated with Medusa's AdminCreateProduct).
// The sales channel is always the store's default one, and the status is
// draft until the marketplace publishes it when
// MARKETPLACE_REQUIRE_PRODUCT_APPROVAL is on (F-075).
export const POST = async (
  req: AuthenticatedMedusaRequest<CreateProductWorkflowInputDTO>,
  res: MedusaResponse
) => {
  const { sales_channels: _ignored, ...product } = req.validatedBody as CreateProductWorkflowInputDTO
  const status = vendorProductStatus(product.status, productApprovalRequired())
  const { result } = await createVendorProductWorkflow(req.scope).run({
    input: {
      vendor_admin_id: req.auth_context.actor_id,
      product: { ...product, status } as CreateProductWorkflowInputDTO,
    },
  })
  const [created] = await vendorProducts(req, [result.product.id])
  res.status(201).json({ product: created })
}
