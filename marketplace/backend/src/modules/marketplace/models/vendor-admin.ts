import { model } from "@medusajs/framework/utils"
import { Vendor } from "./vendor"

// A person who signs in for a vendor (actor type `vendor`, as in the official
// Vendors example; BUILD_PLAN §6.6, TASKS P6-01, P6-03). One email is one
// vendor admin, so a login always maps to exactly one vendor.
export const VendorAdmin = model
  .define("vendor_admin", {
    id: model.id({ prefix: "vadm" }).primaryKey(),
    // Stored lowercase by the workflows that create admins (P6-03).
    email: model.text(),
    first_name: model.text().nullable(),
    last_name: model.text().nullable(),
    vendor: model.belongsTo(() => Vendor, { mappedBy: "admins" }),
  })
  .indexes([{ on: ["email"], unique: true }])
