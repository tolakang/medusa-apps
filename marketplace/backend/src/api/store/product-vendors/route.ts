import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

const Query = z
  .object({
    product_id: z.union([z.string().min(1), z.array(z.string().min(1)).max(100)]),
  })
  .strict()

// GET /store/product-vendors?product_id=…&product_id=… (TASKS P6-08): who
// sells each product, for product pages and the cart ("Sold by …"). Medusa's
// /store/products allows only its own fields, so the vendor link isn't
// readable there. Only active vendors are named; other products are left out.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const parsed = Query.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Send one or more product_id values.")
  }
  const ids = ([] as string[]).concat(parsed.data.product_id)
  const { data: products } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product",
    fields: ["id", "vendor.handle", "vendor.name", "vendor.status"],
    filters: { id: ids },
  })
  res.json({
    product_vendors: products
      .filter((p) => p.vendor?.status === "active")
      .map((p) => ({ product_id: p.id, vendor: { handle: p.vendor!.handle, name: p.vendor!.name } })),
  })
}
