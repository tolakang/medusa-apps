import { defineLink } from "@medusajs/framework/utils";
import OrderModule from "@medusajs/medusa/order";
import CompanyModule from "../modules/company";

// A company has many orders, an order one company (P4-05). The starter's
// one-to-one link refused a company's second linked order ("Cannot create
// multiple links between 'order' and 'company'"). Same link table; the
// cardinality is checked by Medusa's link service, not by an index.
export default defineLink(
  { linkable: OrderModule.linkable.order, isList: true },
  CompanyModule.linkable.company
);
