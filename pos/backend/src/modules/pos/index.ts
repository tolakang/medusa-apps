import { Module } from "@medusajs/framework/utils"
import PosModuleService from "./service"

export const POS_MODULE = "pos"

export default Module(POS_MODULE, {
  service: PosModuleService,
})
