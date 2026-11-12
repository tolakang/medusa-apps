import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import {
  ensureVendorStockLocation,
  setStock,
  stockAt,
  trackedInventoryItems,
} from "../../../../../lib/vendor-stock"
import { vendorIdOf } from "../../../me/vendor-orders"

export const PostVendorProductStock = z
  .object({ quantity: z.number().int().min(0).max(1_000_000) })
  .strict()

export const NOT_TRACKED_MESSAGE =
  "This product is made to order: its stock isn't tracked."

// POST /vendors/products/:id/stock (owner, F-080; TASKS P6-15): the vendor
// sets how many it has in stock (at its own location) for one of its own
// stock-tracked products. Someone else's product answers 404.
export const POST = async (
  req: AuthenticatedMedusaRequest<z.infer<typeof PostVendorProductStock>>,
  res: MedusaResponse
) => {
  const vendorId = await vendorIdOf(req)
  const {
    data: [vendor],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "vendor",
    fields: ["products.id", "products.variants.id"],
    filters: { id: vendorId },
  })
  const product = (vendor?.products ?? []).find((p) => p?.id === req.params.id)
  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Product with id: ${req.params.id} was not found`)
  }
  const items = await trackedInventoryItems(
    req.scope,
    (product.variants ?? []).map((v) => v!.id)
  )
  const itemIds = Object.values(items)
  if (!itemIds.length) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NOT_TRACKED_MESSAGE)
  }
  const locationId = await ensureVendorStockLocation(req.scope, vendorId)
  for (const item of itemIds) {
    await setStock(req.scope, item, locationId, req.validatedBody.quantity)
  }
  const levels = await stockAt(req.scope, itemIds, locationId)
  res.json({ stock: { tracked: true, quantity: levels[itemIds[0]]?.stocked ?? 0, available: levels[itemIds[0]]?.available ?? 0 } })
}
