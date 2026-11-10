import { model } from "@medusajs/framework/utils";

export const ApprovalSettings = model.define("approval_settings", {
  id: model
    .id({
      prefix: "apprset",
    })
    .primaryKey(),
  company_id: model.text(),
  requires_admin_approval: model.boolean().default(false),
  requires_sales_manager_approval: model.boolean().default(false),
  // P4-05 (plan §6.4: "approval flow for orders above a limit"): when an
  // approval type is on, carts with a total above this need it; null = every
  // cart. Set by the merchant only (admin API), so a company admin can't
  // raise it to skip the sales manager.
  approval_threshold: model.bigNumber().nullable(),
});
