import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import PosModule from "../modules/pos"

// The orders sold during a shift (BUILD_PLAN §6.2, TASKS P2-02): one shift,
// many orders. pos-checkout (P2-05) creates the link; close-shift (P2-04)
// reads it to compute the expected cash.
export default defineLink(PosModule.linkable.posShift, {
  linkable: OrderModule.linkable.order,
  isList: true,
})
