import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { createCartWorkflow } from "@medusajs/medusa/core-flows";
import {
  assertApprovedCompanyBuyer,
  assertMinOrderQuantities,
} from "../../utils/b2b-cart-rules";
import { loadBuyer, loadMinimums } from "../../utils/load-b2b-buyer";

// P4-04: `POST /store/carts` with `items` adds them through createCartWorkflow,
// not addToCartWorkflow, so the same rules run here. An empty cart is fine
// for anyone (`customer_id` is the signed-in customer, set by the route).
createCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const items = input.items ?? [];
  if (!items.length) {
    return new StepResponse(undefined, null);
  }

  assertApprovedCompanyBuyer(await loadBuyer(container, input.customer_id));

  const quantities = new Map<string, { title: string | null; quantity: number }>();
  for (const item of items) {
    if (!item.variant_id) {
      continue;
    }
    const line = quantities.get(item.variant_id) ?? {
      title: item.title ?? null,
      quantity: 0,
    };
    line.quantity += Number(item.quantity);
    quantities.set(item.variant_id, line);
  }
  const minimums = await loadMinimums(container, [...quantities.keys()]);
  assertMinOrderQuantities(
    [...quantities.entries()].map(([variantId, line]) => ({
      ...line,
      minimum: minimums.get(variantId) ?? 1,
    }))
  );

  return new StepResponse(undefined, null);
});
