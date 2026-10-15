import { model } from "@medusajs/framework/utils"
import { PosShift } from "./pos-shift"

// A till in a shop (BUILD_PLAN §6.2, TASKS P2-01). Its stock location and
// sales channel are module links (P2-02); no columns on core tables.
export const PosRegister = model
  .define("pos_register", {
    id: model.id({ prefix: "preg" }).primaryKey(),
    name: model.text(),
    // Short code printed on receipts and typed at login, e.g. "PP-01".
    code: model.text().unique(),
    is_active: model.boolean().default(true),
    shifts: model.hasMany(() => PosShift, {
      mappedBy: "register",
    }),
  })
  .cascades({ delete: ["shifts"] })
