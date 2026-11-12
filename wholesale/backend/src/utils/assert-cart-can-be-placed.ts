import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { getCartApprovalStatus } from "./get-cart-approval-status";
import { assertBuyerCanSpend } from "./b2b-spend-checks";
import {
  assertApprovalsGranted,
  assertApprovedCompanyBuyer,
  assertMinOrderQuantities,
  requiredApprovalTypes,
} from "./b2b-cart-rules";
import {
  loadApprovalSettings,
  loadBuyer,
  loadCart,
  loadCartApprovals,
  loadMinimums,
} from "./load-b2b-buyer";

// The B2B rules a cart must pass to become an order: not pending approval,
// an approved company buyer (P4-04), minimum quantities, the approvals its
// total needs (P4-05), the employee's spending limit and, on net terms, the
// company's credit limit. Cart completion checks them (validate hook), and
// so does starting a PayWay payment, because PayWay takes the money before
// the cart completes: a refusal there left a paid cart with no order
// (review 2, M3). Throws NOT_ALLOWED with the reason; only reads.
export async function assertCartCanBePlaced(container: MedusaContainer, cartId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [queryCart],
  } = await query.graph({
    entity: "cart",
    fields: ["approvals.*", "payment_collection.payment_sessions.provider_id"],
    filters: {
      id: cartId,
    },
  });

  // Check if cart is pending approval
  const { isPendingApproval } = getCartApprovalStatus(queryCart);

  if (isPendingApproval) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cart is pending approval");
  }

  // P4-04: the company may have been suspended, or a minimum changed, since
  // the items went in.
  const current = await loadCart(container, cartId);
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
    await loadCartApprovals(container, cartId)
  );

  // Employee spending limit and, on net terms, company credit limit.
  await assertBuyerCanSpend(container, buyer!, company, cartTotal);

  const sessions =
    (queryCart as { payment_collection?: { payment_sessions?: { provider_id?: string }[] } })
      ?.payment_collection?.payment_sessions ?? [];
  return { company, sessions };
}
