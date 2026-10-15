import { defineLink } from "@medusajs/framework/utils"
import CustomerModule from "@medusajs/medusa/customer"
import WishlistModule from "../modules/wishlist"

// Read-only link: no link table, lets Query read a wishlist's customer
// (wishlist guide Step 5; MEDUSA_SKILL §4).
export default defineLink(
  { linkable: WishlistModule.linkable.wishlist.id, field: "customer_id" },
  CustomerModule.linkable.customer,
  { readOnly: true }
)
