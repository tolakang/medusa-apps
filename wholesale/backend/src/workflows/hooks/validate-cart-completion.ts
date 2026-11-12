import { completeCartWorkflow } from "@medusajs/medusa/core-flows";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { assertCartCanBePlaced } from "../../utils/assert-cart-can-be-placed";
import { assertProviderForTerms } from "../../utils/payment-terms-provider";

// Runs before the order is created and payment authorized; it only reads
// (MEDUSA_SKILL §6).
completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  const { company, sessions } = await assertCartCanBePlaced(container, cart.id);

  // P4-12: prepaid companies pay with PayWay, net terms on invoice.
  for (const session of sessions) {
    assertProviderForTerms(session?.provider_id, company.payment_terms);
  }

  return new StepResponse(undefined, null);
});
