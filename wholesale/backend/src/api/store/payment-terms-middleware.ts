import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { loadBuyer } from "../../utils/load-b2b-buyer";
import { assertProviderForTerms } from "../../utils/payment-terms-provider";

// TASKS P4-12: the payment method has to fit the company's terms before a
// payment starts, so a prepaid buyer never reaches "pay by invoice" and a
// net-terms buyer isn't sent to PayWay. Cart completion checks it again
// (validate hook), which also covers PayWay's callback.
export async function requireProviderForTerms(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    const {
      data: [collection],
    } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "payment_collection",
      fields: ["cart.customer_id"],
      filters: { id: req.params.id },
    });
    const customerId = (collection as { cart?: { customer_id?: string } } | undefined)?.cart
      ?.customer_id;
    const company = customerId
      ? (await loadBuyer(req.scope, customerId))?.employee?.company
      : null;
    if (company) {
      assertProviderForTerms(
        (req.body as { provider_id?: string } | undefined)?.provider_id,
        company.payment_terms
      );
    }
    next();
  } catch (error) {
    next(error);
  }
}
