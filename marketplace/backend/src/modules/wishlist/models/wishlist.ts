import { model } from "@medusajs/framework/utils"
import { WishlistItem } from "./wishlist-item"

// A customer's wishlist in one sales channel (TASKS P1-19), from the official
// guide "How to Build a Wishlist Plugin" (resources/plugins/guides/wishlist),
// kept as a module in this backend. Customer and sales channel are linked
// read-only (src/links/wishlist-*.ts); no columns on core tables.
export const Wishlist = model
  .define("wishlist", {
    id: model.id().primaryKey(),
    customer_id: model.text(),
    sales_channel_id: model.text(),
    items: model.hasMany(() => WishlistItem, {
      mappedBy: "wishlist",
    }),
  })
  .cascades({ delete: ["items"] })
  .indexes([{ on: ["customer_id", "sales_channel_id"], unique: true }])
