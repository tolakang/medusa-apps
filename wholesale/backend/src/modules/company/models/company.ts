import { model } from "@medusajs/framework/utils";
import { Employee } from "./employee";

export const Company = model.define("company", {
  id: model
    .id({
      prefix: "comp",
    })
    .primaryKey(),
  name: model.text(),
  email: model.text(),
  phone: model.text().nullable(),
  address: model.text().nullable(),
  city: model.text().nullable(),
  state: model.text().nullable(),
  zip: model.text().nullable(),
  country: model.text().nullable(),
  logo_url: model.text().nullable(),
  currency_code: model.text().nullable(),
  spending_limit_reset_frequency: model
    .enum(["never", "daily", "weekly", "monthly", "yearly"])
    .default("monthly"),
  // P4-02 (plan §6.4). Set by admins only; the store API can't write them
  // except tax_id. Enforced at checkout by P4-04.
  payment_terms: model
    .enum(["prepaid", "net_15", "net_30", "net_60"])
    .default("prepaid"),
  // null = no credit limit set for this company.
  credit_limit: model.bigNumber().nullable(),
  tax_id: model.text().nullable(),
  // "approved" by default so admin-created companies work as before;
  // WHOLESALE_REQUIRE_APPROVAL (P4-07) creates store sign-ups as "pending".
  status: model
    .enum(["pending", "approved", "suspended"])
    .default("approved"),
  employees: model.hasMany(() => Employee),
});
