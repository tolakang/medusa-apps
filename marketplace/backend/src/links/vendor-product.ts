import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import MarketplaceModule from "../modules/marketplace"

// A vendor has many products; a product has one vendor (BUILD_PLAN §6.6,
// TASKS P6-02). As in the official Vendors example (`src/links/
// vendor-product.ts`). Products without a link are the marketplace's own.
export default defineLink(MarketplaceModule.linkable.vendor, {
  linkable: ProductModule.linkable.product.id,
  isList: true,
})
