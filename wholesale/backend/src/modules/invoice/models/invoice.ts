import { model } from "@medusajs/framework/utils";

// P4-06 (plan §6.4, invoice tutorial pattern): one invoice per order. It
// keeps what was true when the order was placed (the buyer's company, tax
// ID and payment terms), so a later change to the company doesn't rewrite
// an issued invoice. The PDF is rendered from it and the order on request.
export const Invoice = model
  .define("invoice", {
    id: model.id({ prefix: "inv" }).primaryKey(),
    // INV-000001, INV-000002, …
    display_id: model.autoincrement(),
    order_id: model.text(),
    company_id: model.text().nullable(),
    company_name: model.text().nullable(),
    tax_id: model.text().nullable(),
    payment_terms: model
      .enum(["prepaid", "net_15", "net_30", "net_60"])
      .default("prepaid"),
    issued_at: model.dateTime(),
    due_at: model.dateTime(),
  })
  .indexes([{ on: ["order_id"], unique: true }]);
