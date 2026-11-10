import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { invoicePdfForOrder, sendPdf } from "../../../../../utils/invoice-pdf";

// P4-06: the order's invoice PDF for staff (admin routes require a user).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { pdf, number } = await invoicePdfForOrder(req.scope, req.params.id);
  sendPdf(res, pdf, number);
};
