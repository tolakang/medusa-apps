import { MedusaService } from "@medusajs/framework/utils"
import TelegramOrderChat from "./models/telegram-order-chat"

class TelegramLinksModuleService extends MedusaService({ TelegramOrderChat }) {}

export default TelegramLinksModuleService
