import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import WishlistModule from "../modules/wishlist"

// Lets Query read `items.product_variant.product` for the wishlist pages.
export default defineLink(
  { linkable: WishlistModule.linkable.wishlistItem.id, field: "product_variant_id" },
  ProductModule.linkable.productVariant,
  { readOnly: true }
)
