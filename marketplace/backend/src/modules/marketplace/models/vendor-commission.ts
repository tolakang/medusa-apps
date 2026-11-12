import { model } from "@medusajs/framework/utils"
import { Vendor } from "./vendor"

// What the marketplace keeps of one child order, and what it owes the vendor
// for it (BUILD_PLAN §6.6, TASKS P6-06, F-078). One per child order
// (`order_id` unique). The order is in the Order Module: its id is plain
// text, no foreign key into core tables.
export const VendorCommission = model
  .define("vendor_commission", {
    id: model.id({ prefix: "vcom" }).primaryKey(),
    order_id: model.text(),
    // The child order's total (items, the vendor's shipping share, tax),
    // copied when recorded.
    order_total: model.bigNumber(),
    // What the commission is taken on: the items after discounts, without
    // tax and shipping (as Reseller, D11).
    base: model.bigNumber(),
    // Percent applied, 0 to 100.
    rate: model.float(),
    // The marketplace's commission: base × rate.
    amount: model.bigNumber(),
    // What the vendor is owed for the order: order_total − amount (plan §6.6
    // acceptance: "payouts equal order totals minus commission").
    payout_amount: model.bigNumber(),
    currency_code: model.text(),
    // pending: recorded at checkout; approved: in a payout (payout_id) not
    // yet paid; paid: that payout was paid; cancelled: the order was
    // cancelled before its payout.
    status: model
      .enum(["pending", "approved", "paid", "cancelled"])
      .default("pending"),
    payout_id: model.text().nullable(),
    vendor: model.belongsTo(() => Vendor, { mappedBy: "commissions" }),
  })
  .indexes([{ on: ["order_id"], unique: true }])
  .checks([
    {
      name: "vendor_commission_rate_percent",
      expression: (columns) => `${columns.rate} >= 0 AND ${columns.rate} <= 100`,
    },
    {
      name: "vendor_commission_amounts_not_negative",
      expression: (columns) =>
        `${columns.amount} >= 0 AND ${columns.base} >= 0 AND ${columns.order_total} >= 0 AND ${columns.payout_amount} >= 0`,
    },
  ])
