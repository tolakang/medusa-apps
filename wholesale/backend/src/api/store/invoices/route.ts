import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { INVOICE_MODULE } from "../../../modules/invoice";
import InvoiceModuleService from "../../../modules/invoice/service";
import { invoiceNumber } from "../../../modules/invoice/terms";
import { loadBuyer } from "../../../utils/load-b2b-buyer";

// P4-06: the buyer's invoices, newest first: their own orders', and for a
// company admin the whole company's. Each row says what is still due; the
// PDF is GET /store/orders/:id/invoice.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const customerId = req.auth_context.actor_id;
  const buyer = await loadBuyer(req.scope, customerId);
  const company = buyer?.employee?.company;

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { customer_id: customerId },
  });
  const ownOrderIds = orders.map((order) => order.id);
  const invoices = req.scope.resolve<InvoiceModuleService>(INVOICE_MODULE);
  const rows =
    buyer?.employee?.is_admin && company
      ? await invoices.listInvoices({ company_id: company.id }, { order: { display_id: "DESC" } })
      : ownOrderIds.length
        ? await invoices.listInvoices({ order_id: ownOrderIds }, { order: { display_id: "DESC" } })
        : [];

  const { data: details } = rows.length
    ? await query.graph({
        entity: "order",
        fields: [
          "id",
          "display_id",
          "currency_code",
          "total",
          "payment_collections.captured_amount",
        ],
        filters: { id: rows.map((row) => row.order_id) },
      })
    : { data: [] };
  const byId = new Map(details.map((order) => [order.id, order]));

  res.json({
    invoices: rows.map((row) => {
      const order = byId.get(row.order_id);
      const total = Number(order?.total ?? 0);
      const paid = (order?.payment_collections ?? []).reduce(
        (sum, collection) => sum + Number(collection?.captured_amount ?? 0),
        0
      );
      return {
        id: row.id,
        number: invoiceNumber(row.display_id),
        order_id: row.order_id,
        order_display_id: order?.display_id ?? null,
        company_name: row.company_name,
        payment_terms: row.payment_terms,
        issued_at: row.issued_at,
        due_at: row.due_at,
        currency_code: order?.currency_code ?? null,
        total,
        amount_due: Math.max(0, total - paid),
      };
    }),
    count: rows.length,
  });
};
