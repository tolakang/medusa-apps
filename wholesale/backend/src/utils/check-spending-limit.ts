import { HttpTypes } from "@medusajs/framework/types";
import {
  ModuleCompanySpendingLimitResetFrequency,
  QueryEmployee,
} from "../types";

// The company as the module stores it or as query.graph returns it (where the
// enum is its string values).
type SpendWindowCompany = {
  spending_limit_reset_frequency?: `${ModuleCompanySpendingLimitResetFrequency}` | null;
};

// The window a spending limit counts orders in, from its start to `now`.
// Windows are in UTC (the timezone the servers run in), so they don't move
// with the machine's local time, and `now` is never changed: the starter set
// the day's start with `now.setHours(0, 0, 0, 0)`, which also moved the end to
// midnight, so a daily limit never counted the day's earlier orders
// (REVIEW_FIXES B1).
export function getSpendWindow(
  company: SpendWindowCompany | null | undefined,
  now: Date = new Date()
): {
  start: Date;
  end: Date;
} {
  const end = new Date(now);
  const year = end.getUTCFullYear();
  const month = end.getUTCMonth();
  const day = end.getUTCDate();

  switch (company?.spending_limit_reset_frequency) {
    case ModuleCompanySpendingLimitResetFrequency.DAILY:
      return { start: new Date(Date.UTC(year, month, day)), end };
    case ModuleCompanySpendingLimitResetFrequency.WEEKLY:
      // The week starts on Sunday.
      return {
        start: new Date(Date.UTC(year, month, day - end.getUTCDay())),
        end,
      };
    case ModuleCompanySpendingLimitResetFrequency.MONTHLY:
      return { start: new Date(Date.UTC(year, month, 1)), end };
    case ModuleCompanySpendingLimitResetFrequency.YEARLY:
      return { start: new Date(Date.UTC(year, 0, 1)), end };
    default:
      // "never", or no company: every order counts.
      return { start: new Date(0), end };
  }
}

// An order as the HTTP types or query.graph (list items may be null) return it.
type SpendOrder = Pick<HttpTypes.StoreOrder, "created_at" | "total"> | null;

export function getOrderTotalInSpendWindow(
  orders: SpendOrder[],
  spendWindow: { start: Date; end: Date }
): number {
  return (
    orders.reduce((acc, order) => {
      if (!order) {
        return acc;
      }
      const orderDate = new Date(order.created_at);
      if (orderDate >= spendWindow.start && orderDate <= spendWindow.end) {
        return acc + order.total;
      }
      return acc;
    }, 0) || 0
  );
}

export function checkSpendingLimit(
  cart: Pick<HttpTypes.StoreCart, "total"> | null,
  customer: {
    employee?: Pick<QueryEmployee, "spending_limit"> & {
      company?: SpendWindowCompany | null;
    } | null;
    orders?: SpendOrder[] | null;
  } | null
) {
  if (!cart || !customer || !customer.employee) {
    return false;
  }

  if (
    !customer?.employee?.spending_limit ||
    customer?.employee?.spending_limit === 0
  ) {
    return false;
  }

  const spendingLimit = customer.employee.spending_limit;
  const spendWindow = getSpendWindow(customer.employee.company);
  const spent = getOrderTotalInSpendWindow(customer.orders || [], spendWindow);

  return spent + cart.total > spendingLimit;
}
