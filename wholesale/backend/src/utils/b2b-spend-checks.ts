import { MedusaContainer } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { checkSpendingLimit } from "./check-spending-limit";
import {
  assertCreditLimit,
  B2bBuyer,
  B2bCompany,
  getOutstandingCredit,
  spendOrders,
} from "./b2b-cart-rules";
import { loadCompanyOrders, loadCustomerOrders } from "./load-b2b-buyer";

/**
 * P4-04 / P4-05: the employee's spending limit (over the company's reset
 * window, past orders included) and, on net terms, the company's credit
 * limit (unpaid orders included). Used at checkout and when a buyer accepts
 * a quote, so both follow the same rules.
 */
export async function assertBuyerCanSpend(
  container: MedusaContainer,
  buyer: B2bBuyer,
  company: B2bCompany,
  total: number
) {
  // The starter read only the limit, so past orders never counted (F-056).
  if (buyer.employee?.spending_limit) {
    const orders = spendOrders(
      await loadCustomerOrders(container, buyer.customer_id)
    );
    const exceeded = checkSpendingLimit(
      { total },
      {
        employee: { spending_limit: buyer.employee.spending_limit, company },
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

  if (company.payment_terms && company.payment_terms !== "prepaid") {
    const outstanding = getOutstandingCredit(
      await loadCompanyOrders(container, company.id)
    );
    assertCreditLimit(company, outstanding, total);
  }
}
