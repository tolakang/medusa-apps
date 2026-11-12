import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import MarketplaceModule from "../modules/marketplace"

// A vendor has many orders; an order has one vendor (BUILD_PLAN §6.6, TASKS
// P6-02). Only the vendor's **child** orders are linked (P6-05); the parent
// order the customer paid has no vendor. As in the official Vendors example
// (`src/links/vendor-order.ts`).
export default defineLink(MarketplaceModule.linkable.vendor, {
  linkable: OrderModule.linkable.order.id,
  isList: true,
})
