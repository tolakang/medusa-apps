import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import {
  assertCanSeeOrderInvoice,
  invoicePdfForOrder,
  sendPdf,
} from "../../../../../utils/invoice-pdf";

// P4-06: the buyer's invoice PDF. The tutorial's store route served any
// order id to anyone; this one only the order's customer or an admin of
// their company.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await assertCanSeeOrderInvoice(req.scope, req.params.id, req.auth_context.actor_id);
  const { pdf, number } = await invoicePdfForOrder(req.scope, req.params.id);
  sendPdf(res, pdf, number);
};
