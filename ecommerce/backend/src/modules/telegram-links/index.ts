import { Module } from "@medusajs/framework/utils"
import TelegramLinksModuleService from "./service"

export const TELEGRAM_LINKS_MODULE = "telegram_links"

export default Module(TELEGRAM_LINKS_MODULE, {
  service: TelegramLinksModuleService,
})
