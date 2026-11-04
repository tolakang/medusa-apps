import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import PaywayProviderService from "./service"

// Registered as pp_payway_payway; webhook /hooks/payment/payway_payway
// (Medusa docs "Payment Webhook Events"). TASKS P1-03.
export default ModuleProvider(Modules.PAYMENT, {
  services: [PaywayProviderService],
})
