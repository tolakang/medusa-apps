import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows";
import {
  assertApprovedCompanyBuyer,
  assertMinOrderQuantities,
} from "../../utils/b2b-cart-rules";
import { loadBuyer, loadCart, loadMinimums } from "../../utils/load-b2b-buyer";

// P4-04: changing a line's quantity follows the same rules as adding it.
updateLineItemInCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const cart = await loadCart(container, input.cart_id);
  assertApprovedCompanyBuyer(await loadBuyer(container, cart?.customer_id));

  const quantity = input.update?.quantity;
  if (quantity === undefined || quantity === null) {
    return new StepResponse(undefined, null);
  }
  const line = (cart?.items ?? []).find((item) => item?.id === input.item_id);
  if (!line?.variant_id) {
    return new StepResponse(undefined, null);
  }
  const minimums = await loadMinimums(container, [line.variant_id]);
  assertMinOrderQuantities([
    {
      title: line.title,
      quantity: Number(quantity),
      minimum: minimums.get(line.variant_id) ?? 1,
    },
  ]);

  return new StepResponse(undefined, null);
});
