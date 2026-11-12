import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { CreateProductWorkflowInputDTO } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  productApprovalRequired,
  vendorProductStatus,
} from "../../../lib/vendor-product-status"
import { createVendorProductWorkflow } from "../../../workflows/marketplace/create-vendor-product"
import {
  ensureVendorStockLocation,
  stockAt,
  trackedInventoryItems,
} from "../../../lib/vendor-stock"
import { vendorIdOf } from "../me/vendor-orders"

export const STOCK_QUANTITY_MESSAGE =
  "additional_data.stock_quantity is a whole number, 0 or more."

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

// Each product's stock at the vendor's location (F-080): tracked when its
// variant manages inventory; null quantity = made to order.
async function withStock(req: AuthenticatedMedusaRequest, products: Record<string, any>[]) {
  const vendorId = await vendorIdOf(req)
  const {
    data: [vendor],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "vendor",
    fields: ["stock_locations.id"],
    filters: { id: vendorId },
  })
  const locationId = vendor?.stock_locations?.[0]?.id
  const variantIds = products.flatMap((p) => (p.variants ?? []).map((v: { id: string }) => v.id))
  const items = await trackedInventoryItems(req.scope, variantIds)
  const levels = locationId ? await stockAt(req.scope, Object.values(items), locationId) : {}
  return products.map((p) => {
    const item = items[p.variants?.[0]?.id]
    return {
      ...p,
      stock: item
        ? { tracked: true, quantity: levels[item]?.stocked ?? 0, available: levels[item]?.available ?? 0 }
        : { tracked: false, quantity: null, available: null },
    }
  })
}

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
  const products = await withStock(req, await vendorProducts(req))
  res.json({ products, count: products.length })
}

// POST /vendors/products (TASKS P6-04): a vendor adds a product (body as the
// admin's POST /admin/products, validated with Medusa's AdminCreateProduct).
// The sales channel is always the store's default one, and the status is
// draft until the marketplace publishes it when
// MARKETPLACE_REQUIRE_PRODUCT_APPROVAL is on (F-075). Stock-tracked variants
// start with `additional_data.stock_quantity` at the vendor's location
// (F-080).
export const POST = async (
  req: AuthenticatedMedusaRequest<CreateProductWorkflowInputDTO>,
  res: MedusaResponse
) => {
  const {
    sales_channels: _ignored,
    additional_data,
    ...product
  } = req.validatedBody as CreateProductWorkflowInputDTO & {
    additional_data?: { stock_quantity?: unknown }
  }
  const status = vendorProductStatus(product.status, productApprovalRequired())
  // Starting stock for stock-tracked variants (F-080). Variants with
  // manage_inventory: false are made to order and get none.
  const raw = additional_data?.stock_quantity
  if (raw !== undefined && (!Number.isInteger(raw) || (raw as number) < 0)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, STOCK_QUANTITY_MESSAGE)
  }
  const locationId = await ensureVendorStockLocation(req.scope, await vendorIdOf(req))
  const { result } = await createVendorProductWorkflow(req.scope).run({
    input: {
      vendor_admin_id: req.auth_context.actor_id,
      product: { ...product, status } as CreateProductWorkflowInputDTO,
      stock: { location_id: locationId, quantity: (raw as number | undefined) ?? 0 },
    },
  })
  const [created] = await withStock(req, await vendorProducts(req, [result.product.id]))
  res.status(201).json({ product: created })
}
