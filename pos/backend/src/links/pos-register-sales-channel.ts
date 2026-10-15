import { defineLink } from "@medusajs/framework/utils"
import SalesChannelModule from "@medusajs/medusa/sales-channel"
import PosModule from "../modules/pos"

// Each register sells in one sales channel (the shop's POS channel); a channel
// can have many registers (BUILD_PLAN §6.2, TASKS P2-02).
export default defineLink(
  { linkable: PosModule.linkable.posRegister, isList: true },
  SalesChannelModule.linkable.salesChannel
)
