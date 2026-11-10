import { defineLink } from "@medusajs/framework/utils"
import SalesChannelModule from "@medusajs/medusa/sales-channel"
import SellerModule from "../modules/seller"

// One seller, one sales channel (BUILD_PLAN §6.5, TASKS P5-02). The channel
// holds the products the seller shows (P5-06) and its publishable key is the
// one the multi-tenant storefront sends for the seller's domain (P5-07);
// orders in the channel earn the seller's commission (P5-04). Without
// `isList` the link is one-to-one: a second link for either side is refused
// (MEDUSA_SKILL §4). No delete cascade: the channel keeps its order history.
export default defineLink(
  SellerModule.linkable.seller,
  SalesChannelModule.linkable.salesChannel
)
