import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { addToCartWorkflow } from "@medusajs/medusa/core-flows";
import { getCartApprovalStatus } from "../../utils/get-cart-approval-status";
import {
  assertApprovedCompanyBuyer,
  assertMinOrderQuantities,
} from "../../utils/b2b-cart-rules";
import { loadBuyer, loadCart, loadMinimums } from "../../utils/load-b2b-buyer";

addToCartWorkflow.hooks.validate(async ({ input, cart }, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [queryCart],
  } = await query.graph({
    entity: "cart",
    fields: ["approvals.*"],
    filters: {
      id: cart.id,
    },
  });

  const { isPendingApproval } = getCartApprovalStatus(queryCart);

  if (isPendingApproval) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cart is pending approval");
  }

  // P4-04: only employees of an approved company buy, and each line reaches
  // its minimum order quantity. A new item adds to the line of the same
  // variant, so the check uses the quantity the line will have.
  const current = await loadCart(container, cart.id);
  assertApprovedCompanyBuyer(await loadBuyer(container, current?.customer_id));

  const items = input.items ?? [];
  const variantIds = items
    .map((item) => item.variant_id)
    .filter((id): id is string => !!id);
  const minimums = await loadMinimums(container, variantIds);
  const inCart = (variantId: string) =>
    (current?.items ?? [])
      .filter((line) => line?.variant_id === variantId)
      .reduce((sum, line) => sum + Number(line?.quantity ?? 0), 0);

  assertMinOrderQuantities(
    items
      .filter((item) => item.variant_id)
      .map((item) => ({
        title: item.title ?? null,
        quantity: inCart(item.variant_id!) + Number(item.quantity),
        minimum: minimums.get(item.variant_id!) ?? 1,
      }))
  );

  return new StepResponse(undefined, null);
});
