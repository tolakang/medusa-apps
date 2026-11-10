import { completeCartWorkflow } from "@medusajs/medusa/core-flows";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { getCartApprovalStatus } from "../../utils/get-cart-approval-status";
import { assertBuyerCanSpend } from "../../utils/b2b-spend-checks";
import {
  assertApprovalsGranted,
  assertApprovedCompanyBuyer,
  assertMinOrderQuantities,
  requiredApprovalTypes,
} from "../../utils/b2b-cart-rules";
import {
  loadApprovalSettings,
  loadBuyer,
  loadCart,
  loadCartApprovals,
  loadMinimums,
} from "../../utils/load-b2b-buyer";

// Runs before the order is created and payment authorized; it only reads
// (MEDUSA_SKILL §6).
completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
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

  // Check if cart is pending approval
  const { isPendingApproval } = getCartApprovalStatus(queryCart);

  if (isPendingApproval) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cart is pending approval");
  }

  // P4-04: the company may have been suspended, or a minimum changed, since
  // the items went in.
  const current = await loadCart(container, cart.id);
  const buyer = await loadBuyer(container, current?.customer_id);
  const company = assertApprovedCompanyBuyer(buyer);

  const lines = (current?.items ?? []).filter((line) => !!line?.variant_id);
  const minimums = await loadMinimums(
    container,
    lines.map((line) => line!.variant_id as string)
  );
  assertMinOrderQuantities(
    lines.map((line) => ({
      title: line!.title,
      quantity: Number(line!.quantity),
      minimum: minimums.get(line!.variant_id as string) ?? 1,
    }))
  );

  const cartTotal = Number(current?.total ?? 0);

  // P4-05: orders above the company's approval threshold need every
  // approval type the company switched on (a company admin's own carts skip
  // the company-admin approval). The starter only blocked pending carts, so
  // a buyer could check out without asking.
  const settings = await loadApprovalSettings(container, company.id);
  assertApprovalsGranted(
    requiredApprovalTypes(settings, cartTotal, !!buyer!.employee?.is_admin),
    await loadCartApprovals(container, cart.id)
  );

  // Employee spending limit and, on net terms, company credit limit.
  await assertBuyerCanSpend(container, buyer!, company, cartTotal);

  return new StepResponse(undefined, null);
});
