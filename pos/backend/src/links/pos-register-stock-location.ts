import { defineLink } from "@medusajs/framework/utils"
import StockLocationModule from "@medusajs/medusa/stock-location"
import PosModule from "../modules/pos"

// Each register sells from one shop's stock location; a location can have
// many registers (BUILD_PLAN §6.2, TASKS P2-02). `isList` on the register
// side = many registers to one location (docs "Define Module Link": brand ↔
// product example).
export default defineLink(
  { linkable: PosModule.linkable.posRegister, isList: true },
  StockLocationModule.linkable.stockLocation
)
