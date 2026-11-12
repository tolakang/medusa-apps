import { model } from "@medusajs/framework/utils"
import { Vendor } from "./vendor"

// What the marketplace owes a vendor for one period and currency
// (BUILD_PLAN §6.6, TASKS P6-01). Created by the scheduled `create-payouts`
// job (P6-06); paid outside Medusa and marked paid with its reference, as in
// Reseller (manual payouts).
export const VendorPayout = model
  .define("vendor_payout", {
    id: model.id({ prefix: "vpay" }).primaryKey(),
    // Child-order totals minus commission for the period, in the currency's
    // main unit (like order totals).
    amount: model.bigNumber(),
    currency_code: model.text(),
    // Calendar month the payout covers, "YYYY-MM" (UTC).
    period: model.text(),
    // pending: calculated, not paid yet; paid: paid out (paid_at,
    // reference); cancelled: voided by the admin.
    status: model.enum(["pending", "paid", "cancelled"]).default("pending"),
    paid_at: model.dateTime().nullable(),
    // Bank transfer or payment reference the admin records when paying.
    reference: model.text().nullable(),
    vendor: model.belongsTo(() => Vendor, { mappedBy: "payouts" }),
  })
  // One payout per vendor, period and currency, so running the job twice
  // can't pay a vendor twice for the same month.
  .indexes([{ on: ["vendor_id", "period", "currency_code"], unique: true }])
  .checks([
    {
      name: "vendor_payout_amount_not_negative",
      expression: (columns) => `${columns.amount} >= 0`,
    },
    {
      name: "vendor_payout_period_format",
      expression: (columns) =>
        `${columns.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    },
  ])
