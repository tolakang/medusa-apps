import { model } from "@medusajs/framework/utils"
import { PosRegister } from "./pos-register"

// A cashier's session at one register (BUILD_PLAN §6.2, TASKS P2-01).
// Cash amounts are in currency_code. expected_cash and counted_cash are set
// when the shift closes (close-shift workflow, P2-04); the variance is
// counted_cash - expected_cash. Orders are linked to the shift (P2-02).
export const PosShift = model
  .define("pos_shift", {
    id: model.id({ prefix: "pshift" }).primaryKey(),
    status: model.enum(["open", "closed"]).default("open"),
    // Cashier actor IDs (custom actor type `cashier`, P2-03).
    opened_by: model.text(),
    closed_by: model.text().nullable(),
    opened_at: model.dateTime(),
    closed_at: model.dateTime().nullable(),
    currency_code: model.text(),
    opening_cash: model.bigNumber(),
    counted_cash: model.bigNumber().nullable(),
    expected_cash: model.bigNumber().nullable(),
    notes: model.text().nullable(),
    register: model.belongsTo(() => PosRegister, {
      mappedBy: "shifts",
    }),
  })
  // One open shift per register, enforced by the database too (plan §6.2
  // open-shift rule): a partial unique index on open shifts only.
  .indexes([
    {
      name: "IDX_pos_shift_one_open_per_register",
      on: ["register_id"],
      unique: true,
      where: { status: "open" },
    },
  ])
