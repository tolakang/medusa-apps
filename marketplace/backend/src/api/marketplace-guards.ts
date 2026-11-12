import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  CHILD_ORDERS_KEY,
  PARENT_ORDER_KEY,
} from "../workflows/marketplace/create-vendor-orders"

export const EXISTING_INVENTORY_MESSAGE =
  "A vendor's variant can't use an existing inventory item: Medusa creates one for each stock-tracked variant."

// POST /vendors/products takes the admin's product body (AdminCreateProduct),
// which lets a variant link to any existing inventory item by id. Item ids
// are public (the store API returns them), so a vendor could attach its
// variant to another vendor's stock and then change that stock (review 2,
// A1). Vendors never need it: core creates an item per stock-tracked variant.
export function refuseExistingInventoryItems(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const variants = (req.body as { variants?: unknown } | undefined)?.variants
  const linksInventory =
    Array.isArray(variants) &&
    variants.some(
      (v) => !!v && typeof v === "object" && (v as { inventory_items?: unknown }).inventory_items !== undefined
    )
  if (linksInventory) {
    return next(new MedusaError(MedusaError.Types.INVALID_DATA, EXISTING_INVENTORY_MESSAGE))
  }
  next()
}

export const RESERVED_METADATA_MESSAGE = `Cart metadata can't set ${PARENT_ORDER_KEY} or ${CHILD_ORDERS_KEY}.`

// A cart's metadata becomes its order's metadata (core completeCartWorkflow),
// and the vendor split reads the parent ↔ child links from there. A customer
// setting them would skip the split for their order or point at other
// orders (review 2, M4), so the store cart routes refuse those keys.
export function refuseVendorOrderMetadata(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const metadata = (req.body as { metadata?: unknown } | undefined)?.metadata
  if (
    metadata &&
    typeof metadata === "object" &&
    (PARENT_ORDER_KEY in metadata || CHILD_ORDERS_KEY in metadata)
  ) {
    return next(new MedusaError(MedusaError.Types.INVALID_DATA, RESERVED_METADATA_MESSAGE))
  }
  next()
}
