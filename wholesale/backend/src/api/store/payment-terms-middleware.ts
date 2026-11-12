import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { assertCartCanBePlaced } from "../../utils/assert-cart-can-be-placed";
import { loadBuyer } from "../../utils/load-b2b-buyer";
import {
  assertProviderForTerms,
  PAYWAY_PROVIDER_ID,
} from "../../utils/payment-terms-provider";

// TASKS P4-12: the payment method has to fit the company's terms before a
// payment starts, so a prepaid buyer never reaches "pay by invoice" and a
// net-terms buyer isn't sent to PayWay. Cart completion checks it again
// (validate hook), which also covers PayWay's callback. A PayWay payment
// also has to pass every checkout rule first (approvals, minimums, spending
// and credit limits): PayWay takes the money before the cart completes, so a
// refusal at completion left money paid with no order (review 2, M3).
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
      fields: ["cart.id", "cart.customer_id"],
      filters: { id: req.params.id },
    });
    const cart = (collection as { cart?: { id?: string; customer_id?: string } } | undefined)
      ?.cart;
    const company = cart?.customer_id
      ? (await loadBuyer(req.scope, cart.customer_id))?.employee?.company
      : null;
    const providerId = (req.body as { provider_id?: string } | undefined)?.provider_id;
    if (company) {
      assertProviderForTerms(providerId, company.payment_terms);
    }
    if (cart?.id && providerId === PAYWAY_PROVIDER_ID) {
      await assertCartCanBePlaced(req.scope, cart.id);
    }
    next();
  } catch (error) {
    next(error);
  }
}
