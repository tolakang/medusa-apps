import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import BookingModule from "../modules/booking"

// Which services a resource offers (BUILD_PLAN §6.3, TASKS P3-02): a service
// is a product variant (P3-12), and the link is many-to-many: a stylist does
// several services, and a service can be done by several stylists or rooms.
// `isList` on both sides = many-to-many (MEDUSA_SKILL §4).
export default defineLink(
  { linkable: BookingModule.linkable.bookingResource, isList: true },
  { linkable: ProductModule.linkable.productVariant, isList: true }
)
