import { defineLink } from "@medusajs/framework/utils"
import StockLocationModule from "@medusajs/medusa/stock-location"
import MarketplaceModule from "../modules/marketplace"

// A vendor has many stock locations (their warehouses); a location belongs
// to one vendor (BUILD_PLAN §6.6, TASKS P6-02). The official Vendors example
// links only products and orders and says other links are defined "in a
// similar manner"; this one follows the same shape.
export default defineLink(MarketplaceModule.linkable.vendor, {
  linkable: StockLocationModule.linkable.stockLocation.id,
  isList: true,
})
