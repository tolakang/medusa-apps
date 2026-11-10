import { MedusaService } from "@medusajs/framework/utils"
import { Seller } from "./models/seller"
import { SellerCommission } from "./models/seller-commission"

// Generated methods (MEDUSA_SKILL §3): createSellers, listSellers,
// updateSellers, createSellerCommissions, listSellerCommissions, …
class SellerModuleService extends MedusaService({
  Seller,
  SellerCommission,
}) {}

export default SellerModuleService
