import {
  B2BCart,
  B2BCustomer,
  ModuleCompanySpendingLimitResetFrequency,
} from "@/types"
import { HttpTypes } from "@medusajs/types"

// Same window as the backend's utils/check-spending-limit.ts: UTC, and `now`
// is never changed. The starter's `now.setHours(0, 0, 0, 0)` also moved the
// end to midnight, so a daily limit counted none of the day's orders and the
// pay button showed for a cart the backend then refused (review 2, M3).
// TODO: Fix type as part of moving all types to a dedicated workspace package
export function getSpendWindow(
  company: any,
  now: Date = new Date()
): {
  start: Date
  end: Date
} {
  const end = new Date(now)
  const year = end.getUTCFullYear()
  const month = end.getUTCMonth()
  const day = end.getUTCDate()

  switch (company?.spending_limit_reset_frequency) {
    case ModuleCompanySpendingLimitResetFrequency.DAILY:
      return { start: new Date(Date.UTC(year, month, day)), end }
    case ModuleCompanySpendingLimitResetFrequency.WEEKLY:
      // The week starts on Sunday.
      return { start: new Date(Date.UTC(year, month, day - end.getUTCDay())), end }
    case ModuleCompanySpendingLimitResetFrequency.MONTHLY:
      return { start: new Date(Date.UTC(year, month, 1)), end }
    case ModuleCompanySpendingLimitResetFrequency.YEARLY:
      return { start: new Date(Date.UTC(year, 0, 1)), end }
    default:
      // "never", or no company: every order counts.
      return { start: new Date(0), end }
  }
}

export function getOrderTotalInSpendWindow(
  orders: HttpTypes.StoreOrder[],
  spendWindow: { start: Date; end: Date }
): number {
  return (
    orders.reduce((acc, order) => {
      const orderDate = new Date(order.created_at)
      if (orderDate >= spendWindow.start && orderDate <= spendWindow.end) {
        return acc + order.total
      }
      return acc
    }, 0) || 0
  )
}

export function checkSpendingLimit(
  cart: B2BCart | null,
  customer: B2BCustomer | null
) {
  if (!cart || !customer || !customer.employee) {
    return false
  }

  if (
    !customer?.employee?.spending_limit ||
    customer?.employee?.spending_limit === 0
  ) {
    return false
  }

  const spendingLimit = customer.employee.spending_limit
  const spendWindow = getSpendWindow(customer.employee.company)
  const spent = getOrderTotalInSpendWindow(customer.orders || [], spendWindow)

  return spent + cart.total > spendingLimit
}
