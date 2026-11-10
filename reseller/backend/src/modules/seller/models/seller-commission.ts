import { model } from "@medusajs/framework/utils"
import { Seller } from "./seller"

// What a seller earns on one order (BUILD_PLAN §6.5, TASKS P5-01). One per
// order (`order_id` unique), so recording it twice for the same order can't
// create a second one (P5-04, P5-09). The order is in the Order module: its
// id is plain text, no foreign key into core tables.
export const SellerCommission = model
  .define("seller_commission", {
    id: model.id({ prefix: "scom" }).primaryKey(),
    order_id: model.text(),
    // Copied from the order when the commission is recorded, so later order
    // edits or rate changes don't change what was earned.
    order_total: model.bigNumber(),
    // Percent applied, 0 to 100.
    rate: model.float(),
    amount: model.bigNumber(),
    currency_code: model.text(),
    // pending: recorded at order; approved: due in the next payout (P5-05);
    // paid: paid out (paid_at); cancelled: order cancelled or refunded (P5-04).
    status: model
      .enum(["pending", "approved", "paid", "cancelled"])
      .default("pending"),
    paid_at: model.dateTime().nullable(),
    seller: model.belongsTo(() => Seller, {
      mappedBy: "commissions",
    }),
  })
  .indexes([{ on: ["order_id"], unique: true }])
  .checks([
    {
      name: "seller_commission_rate_percent",
      expression: (columns) => `${columns.rate} >= 0 AND ${columns.rate} <= 100`,
    },
    {
      name: "seller_commission_amount_not_negative",
      expression: (columns) =>
        `${columns.amount} >= 0 AND ${columns.order_total} >= 0`,
    },
  ])
