import { model } from "@medusajs/framework/utils"
import { SellerCommission } from "./seller-commission"

// A reseller: sells your products on their own storefront domain and earns a
// commission on each order (BUILD_PLAN §6.5, TASKS P5-01). Their sales
// channel (and its publishable key) is a module link (P5-02); their login is
// the custom actor type `seller` (P5-03).
export const Seller = model
  .define("seller", {
    id: model.id({ prefix: "sel" }).primaryKey(),
    // URL-safe name: lowercase letters, digits and single hyphens. Used for
    // `SELLER_RESOLVE_MODE=path` and in admin lists.
    handle: model.text(),
    name: model.text(),
    email: model.text(),
    // The seller's storefront host, e.g. "shop.seller.com" (lowercase, no
    // scheme or path). Null until they have one.
    domain: model.text().nullable(),
    // pending: signed up, not selling yet; active: their channel earns
    // commissions (P5-04 ignores other statuses); suspended: stopped.
    status: model.enum(["pending", "active", "suspended"]).default("pending"),
    // Percent of the order total, 0 to 100. Null = the shop's default
    // (RESELLER_DEFAULT_COMMISSION_RATE), read when a commission is recorded.
    commission_rate: model.float().nullable(),
    commissions: model.hasMany(() => SellerCommission, {
      mappedBy: "seller",
    }),
  })
  .indexes([
    { on: ["handle"], unique: true },
    { on: ["domain"], unique: true },
  ])
  .checks([
    {
      name: "seller_handle_format",
      expression: (columns) => `${columns.handle} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    },
    {
      // A lowercase host name with at least one dot, so the storefront's
      // Host lookup (P5-07) matches it exactly.
      name: "seller_domain_format",
      expression: (columns) =>
        `${columns.domain} IS NULL OR ${columns.domain} ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'`,
    },
    {
      name: "seller_commission_rate_percent",
      expression: (columns) =>
        `${columns.commission_rate} IS NULL OR (${columns.commission_rate} >= 0 AND ${columns.commission_rate} <= 100)`,
    },
  ])
