import { MedusaService } from "@medusajs/framework/utils"
import { PosCashier } from "./models/pos-cashier"
import { PosRegister } from "./models/pos-register"
import { PosShift } from "./models/pos-shift"

class PosModuleService extends MedusaService({ PosRegister, PosShift, PosCashier }) {}

export default PosModuleService
