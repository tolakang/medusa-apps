import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { GetAdminVendorProducts } from "./validators"

// GET /admin/vendor-products (TASKS P6-07): vendors' products with their
// vendor, newest first; `?status=proposed` is the moderation queue (vendors'
// products stay unpublished until the marketplace publishes them, P6-04).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const parsed = GetAdminVendorProducts.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.issues[0].message)
  }
  const { status, vendor_id } = parsed.data
  const { data: vendors } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "vendor",
    fields: [
      "id",
      "name",
      "handle",
      "status",
      "products.id",
      "products.title",
      "products.handle",
      "products.status",
      "products.thumbnail",
      "products.created_at",
    ],
    filters: vendor_id ? { id: vendor_id } : {},
  })
  const products = vendors
    .flatMap((vendor) =>
      (vendor.products ?? []).map((product) => ({
        ...product!,
        vendor: { id: vendor.id, name: vendor.name, handle: vendor.handle, status: vendor.status },
      }))
    )
    .filter((p) => !status || p.status === status)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  res.json({ products, count: products.length })
}
