import { model } from "@medusajs/framework/utils"

// A cashier: the custom actor type `cashier` (BUILD_PLAN §6.2, TASKS P2-03;
// docs "How to Create an Actor Type": a module data model per actor type).
// Cashiers are never admin users. An admin invites one by email; the cashier
// then registers that email (POST /auth/cashier/emailpass/register) and
// accepts (POST /pos/cashiers/accept), which links the auth identity to this
// record (app_metadata.cashier_id). is_active = false locks the cashier out.
export const PosCashier = model.define("pos_cashier", {
  id: model.id({ prefix: "pcash" }).primaryKey(),
  name: model.text(),
  // Stored lowercase (create-pos-cashier workflow); matched against the email
  // the cashier registers with.
  email: model.text().unique(),
  is_active: model.boolean().default(true),
})
