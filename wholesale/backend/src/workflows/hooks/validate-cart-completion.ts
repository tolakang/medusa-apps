import { completeCartWorkflow } from "@medusajs/medusa/core-flows";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { getCartApprovalStatus } from "../../utils/get-cart-approval-status";
import { checkSpendingLimit } from "../../utils/check-spending-limit";
import {
  assertApprovedCompanyBuyer,
  assertCreditLimit,
  assertMinOrderQuantities,
  getOutstandingCredit,
  spendOrders,
} from "../../utils/b2b-cart-rules";
import {
  loadBuyer,
  loadCart,
  loadCompanyOrders,
  loadCustomerOrders,
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

  // Employee spending limit, over the company's reset window. The starter
  // read only the limit, so past orders never counted (F-056).
  if (buyer!.employee?.spending_limit) {
    const orders = spendOrders(
      await loadCustomerOrders(container, buyer!.customer_id)
    );
    const exceeded = checkSpendingLimit(
      { total: cartTotal },
      {
        employee: {
          spending_limit: buyer!.employee.spending_limit,
          company,
        },
        orders: orders.map((order) => ({
          created_at: String(order!.created_at),
          total: Number(order!.total ?? 0),
        })),
      }
    );
    if (exceeded) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Cart total exceeds spending limit"
      );
    }
  }

  // Company credit limit, for net-terms companies.
  if (company.payment_terms && company.payment_terms !== "prepaid") {
    const outstanding = getOutstandingCredit(
      await loadCompanyOrders(container, company.id)
    );
    assertCreditLimit(company, outstanding, cartTotal);
  }

  return new StepResponse(undefined, null);
});
