import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import TelegramNotificationProviderService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [TelegramNotificationProviderService],
})
