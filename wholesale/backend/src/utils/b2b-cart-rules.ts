import { MedusaError } from "@medusajs/framework/utils";
import {
  ModuleCompanyPaymentTerms,
  ModuleCompanySpendingLimitResetFrequency,
  ModuleCompanyStatus,
} from "../types";

// P4-04 (plan §6.4): the B2B cart rules, as pure functions so the hooks stay
// thin and the rules can be unit-tested. The hooks load the data
// (src/utils/load-b2b-buyer.ts) and throw what these return.

export type B2bCompany = {
  id: string;
  name?: string | null;
  tax_id?: string | null;
  status?: `${ModuleCompanyStatus}` | null;
  payment_terms?: `${ModuleCompanyPaymentTerms}` | null;
  credit_limit?: number | null;
  spending_limit_reset_frequency?: `${ModuleCompanySpendingLimitResetFrequency}` | null;
};

export type B2bBuyer = {
  customer_id: string;
  employee: {
    id: string;
    spending_limit?: number | null;
    is_admin?: boolean;
    company: B2bCompany | null;
  } | null;
};

// An order as query.graph returns it: totals are numbers, payment
// collections carry what was captured.
export type B2bOrder = {
  id?: string;
  customer_id?: string | null;
  status?: string | null;
  created_at?: string | Date | null;
  total?: number | null;
  payment_collections?:
    | ({ captured_amount?: number | null } | null)[]
    | null;
} | null;

const notAllowed = (message: string) =>
  new MedusaError(MedusaError.Types.NOT_ALLOWED, message);

/**
 * Only a signed-in employee of an approved company may buy. Returns the
 * company.
 */
export function assertApprovedCompanyBuyer(
  buyer: B2bBuyer | null
): B2bCompany {
  if (!buyer?.customer_id) {
    throw notAllowed("Sign in with a company account to buy.");
  }
  const company = buyer.employee?.company;
  if (!company) {
    throw notAllowed(
      "Your account is not part of a company. Ask your company admin to add you."
    );
  }
  if (company.status === "pending") {
    throw notAllowed("Your company is waiting for approval.");
  }
  if (company.status !== "approved") {
    throw notAllowed("Your company account is suspended.");
  }
  return company;
}

/**
 * The minimum order quantity of a variant: `metadata.min_order_quantity` on
 * the variant, else on its product. Anything that isn't a whole number above
 * 1 means no minimum.
 */
export function getMinOrderQuantity(variant: {
  metadata?: Record<string, unknown> | null;
  product?: { metadata?: Record<string, unknown> | null } | null;
} | null): number {
  const parse = (value: unknown) => {
    const n = typeof value === "string" ? Number(value) : value;
    return typeof n === "number" && Number.isInteger(n) && n > 1 ? n : null;
  };
  return (
    parse(variant?.metadata?.min_order_quantity) ??
    parse(variant?.product?.metadata?.min_order_quantity) ??
    1
  );
}

/**
 * Each cart line must reach its variant's minimum order quantity. A quantity
 * of 0 removes the line, so it is allowed.
 */
export function assertMinOrderQuantities(
  lines: { title?: string | null; quantity: number; minimum: number }[]
) {
  for (const line of lines) {
    if (line.quantity > 0 && line.quantity < line.minimum) {
      throw notAllowed(
        `${line.title ?? "This item"} has a minimum order quantity of ${line.minimum}.`
      );
    }
  }
}

const countsAsSpend = (order: B2bOrder) =>
  !!order && order.status !== "canceled" && order.status !== "draft";

/**
 * What a company still owes: for every order that isn't canceled or a draft,
 * its total minus what was captured (net-terms orders are captured when the
 * invoice is paid, P4-06).
 */
export function getOutstandingCredit(orders: B2bOrder[]): number {
  return orders.reduce((sum, order) => {
    if (!countsAsSpend(order)) {
      return sum;
    }
    const captured = (order!.payment_collections ?? []).reduce(
      (paid, collection) => paid + (collection?.captured_amount ?? 0),
      0
    );
    return sum + Math.max(0, (order!.total ?? 0) - captured);
  }, 0);
}

/**
 * Net-terms companies can't owe more than their credit limit. Prepaid
 * companies pay at checkout, and a null limit means none was set (P4-02).
 */
export function assertCreditLimit(
  company: B2bCompany,
  outstanding: number,
  cartTotal: number
) {
  if (!company.payment_terms || company.payment_terms === "prepaid") {
    return;
  }
  if (company.credit_limit === null || company.credit_limit === undefined) {
    return;
  }
  if (outstanding + cartTotal > company.credit_limit) {
    throw notAllowed(
      "This order would take your company over its credit limit."
    );
  }
}

/** Orders that count towards an employee's spending limit. */
export function spendOrders(orders: B2bOrder[]): B2bOrder[] {
  return orders.filter(countsAsSpend);
}

// P4-05 (plan §6.4: "approval flow for orders above a limit").

export type B2bApprovalSettings = {
  requires_admin_approval?: boolean | null;
  requires_sales_manager_approval?: boolean | null;
  approval_threshold?: number | null;
} | null;

export type B2bApproval = {
  type?: string | null;
  status?: string | null;
} | null;

/**
 * The approval types a cart needs: the types the company switched on, when
 * the cart total is above the threshold (no threshold = every cart). A
 * company admin is the company's approver, so their own carts skip the
 * company-admin approval (owner, 2026-11-10); the sales manager still
 * approves them.
 */
export function requiredApprovalTypes(
  settings: B2bApprovalSettings,
  cartTotal: number,
  isCompanyAdmin: boolean
): ("admin" | "sales_manager")[] {
  if (!settings) {
    return [];
  }
  const threshold = settings.approval_threshold;
  if (threshold !== null && threshold !== undefined && cartTotal <= threshold) {
    return [];
  }
  const types: ("admin" | "sales_manager")[] = [];
  if (settings.requires_admin_approval && !isCompanyAdmin) {
    types.push("admin");
  }
  if (settings.requires_sales_manager_approval) {
    types.push("sales_manager");
  }
  return types;
}

/** Every required approval type must have an approved approval. */
export function assertApprovalsGranted(
  required: string[],
  approvals: B2bApproval[]
) {
  if (!required.length) {
    return;
  }
  const live = approvals.filter(Boolean);
  if (live.some((approval) => approval!.status === "rejected")) {
    throw notAllowed("This order was rejected. Start a new cart.");
  }
  for (const type of required) {
    const approved = live.some(
      (approval) => approval!.type === type && approval!.status === "approved"
    );
    if (!approved) {
      throw notAllowed(
        type === "admin"
          ? "This order needs your company admin's approval."
          : "This order needs the sales manager's approval."
      );
    }
  }
}

/**
 * Items can't change once a cart is waiting for approval or approved, or an
 * approved total could grow before checkout.
 */
export function assertCartItemsUnlocked(approvals: B2bApproval[]) {
  const statuses = approvals.filter(Boolean).map((approval) => approval!.status);
  if (statuses.includes("pending")) {
    throw notAllowed("Cart is pending approval");
  }
  if (statuses.includes("approved")) {
    throw notAllowed(
      "This cart is approved, so its items can't change. Start a new cart."
    );
  }
}
