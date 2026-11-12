import { MedusaService } from "@medusajs/framework/utils"
import { Vendor } from "./models/vendor"
import { VendorAdmin } from "./models/vendor-admin"
import { VendorCommission } from "./models/vendor-commission"
import { VendorPayout } from "./models/vendor-payout"

// Generated methods (MEDUSA_SKILL §3): createVendors, listVendors,
// updateVendors, createVendorAdmins, listVendorAdmins, createVendorPayouts,
// listVendorPayouts, createVendorCommissions, listVendorCommissions, …
class MarketplaceModuleService extends MedusaService({
  Vendor,
  VendorAdmin,
  VendorPayout,
  VendorCommission,
}) {}

export default MarketplaceModuleService
