import { MedusaService } from "@medusajs/framework/utils"
import { PosRegister } from "./models/pos-register"
import { PosShift } from "./models/pos-shift"

class PosModuleService extends MedusaService({ PosRegister, PosShift }) {}

export default PosModuleService
