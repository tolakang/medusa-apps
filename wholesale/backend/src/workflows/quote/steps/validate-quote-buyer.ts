import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep } from "@medusajs/framework/workflows-sdk";
import { assertApprovedCompanyBuyer } from "../../../utils/b2b-cart-rules";
import { assertBuyerCanSpend } from "../../../utils/b2b-spend-checks";
import { loadBuyer } from "../../../utils/load-b2b-buyer";

/**
 * P4-05 (owner, 2026-11-10): accepting a quote turns its draft order into an
 * order without a cart, so the checkout rules run here: the quote is the
 * buyer's own, their company is approved, and the quoted total (with the
 * merchant's pending edits, `previewOrderChange`) fits the spending and
 * credit limits.
 */
export const validateQuoteBuyerStep = createStep(
  "validate-quote-buyer",
  async function (
    input: { quote_id: string; customer_id: string },
    { container }
  ) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const {
      data: [quote],
    } = await query.graph({
      entity: "quote",
      fields: ["id", "customer_id", "draft_order_id"],
      filters: { id: input.quote_id },
    });
    if (!quote || quote.customer_id !== input.customer_id) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "You can only accept your own quote."
      );
    }

    const buyer = await loadBuyer(container, input.customer_id);
    const company = assertApprovedCompanyBuyer(buyer);

    const preview = await container
      .resolve(Modules.ORDER)
      .previewOrderChange(quote.draft_order_id);
    await assertBuyerCanSpend(container, buyer!, company, Number(preview.total ?? 0));
  }
);
