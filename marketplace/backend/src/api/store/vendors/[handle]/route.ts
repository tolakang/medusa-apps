import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// GET /store/vendors/:handle (TASKS P6-08): an active vendor's shop page:
// its public details and its published products' ids (the storefront reads
// the products themselves, with prices, through /store/products). Pending
// or suspended vendors have no shop page (404).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const {
    data: [vendor],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "vendor",
    fields: ["id", "handle", "name", "logo", "status", "products.id", "products.status"],
    filters: { handle: req.params.handle },
  })
  if (!vendor || vendor.status !== "active") {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vendor not found.")
  }
  res.json({
    vendor: { id: vendor.id, handle: vendor.handle, name: vendor.name, logo: vendor.logo },
    product_ids: (vendor.products ?? [])
      .filter((p) => p?.status === "published")
      .map((p) => p!.id),
  })
}
