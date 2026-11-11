import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { B2bBuyer, B2bOrder, getMinOrderQuantity } from "./b2b-cart-rules";

// P4-04: data for the B2B cart rules. The company always comes from the
// customer's employee record, never from cart metadata (the client sets
// that).

const queryOf = (container: MedusaContainer) =>
  container.resolve(ContainerRegistrationKeys.QUERY);

export async function loadCart(container: MedusaContainer, cartId: string) {
  const {
    data: [cart],
  } = await queryOf(container).graph({
    entity: "cart",
    fields: [
      "id",
      "customer_id",
      "total",
      "items.id",
      "items.title",
      "items.quantity",
      "items.variant_id",
    ],
    filters: { id: cartId },
  });
  return cart;
}

export async function loadBuyer(
  container: MedusaContainer,
  customerId: string | null | undefined
): Promise<B2bBuyer | null> {
  if (!customerId) {
    return null;
  }
  const {
    data: [customer],
  } = await queryOf(container).graph({
    entity: "customer",
    fields: [
      "id",
      "employee.id",
      "employee.spending_limit",
      "employee.is_admin",
      "employee.company.id",
      "employee.company.name",
      "employee.company.tax_id",
      "employee.company.status",
      "employee.company.payment_terms",
      "employee.company.credit_limit",
      "employee.company.spending_limit_reset_frequency",
    ],
    filters: { id: customerId },
  });
  if (!customer) {
    return null;
  }
  return {
    customer_id: customer.id,
    employee: customer.employee
      ? {
          id: customer.employee.id,
          spending_limit: customer.employee.spending_limit ?? null,
          is_admin: !!customer.employee.is_admin,
          company: customer.employee.company ?? null,
        }
      : null,
  } as B2bBuyer;
}

/** Minimum order quantity per variant id. */
export async function loadMinimums(
  container: MedusaContainer,
  variantIds: string[]
): Promise<Map<string, number>> {
  const ids = [...new Set(variantIds.filter(Boolean))];
  if (!ids.length) {
    return new Map();
  }
  const { data: variants } = await queryOf(container).graph({
    entity: "variant",
    fields: ["id", "metadata", "product.metadata"],
    filters: { id: ids },
  });
  return new Map(
    variants.map((variant) => [variant.id, getMinOrderQuantity(variant)])
  );
}

const ORDER_FIELDS = [
  "id",
  "customer_id",
  "status",
  "created_at",
  "total",
  "payment_collections.captured_amount",
];

/** Orders placed by one customer. */
export async function loadCustomerOrders(
  container: MedusaContainer,
  customerId: string
): Promise<B2bOrder[]> {
  const { data } = await queryOf(container).graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { customer_id: customerId },
  });
  return data as B2bOrder[];
}

/**
 * A company's orders: those linked to it (the link is made when an order is
 * placed, and stays when the employee who placed it leaves) and those of its
 * current employees (which covers an order whose link isn't there yet).
 * Counting only current employees let a company free its used credit by
 * removing an employee (REVIEW_FIXES B4).
 */
export async function loadCompanyOrders(
  container: MedusaContainer,
  companyId: string
): Promise<B2bOrder[]> {
  const query = queryOf(container);
  const {
    data: [company],
  } = await query.graph({
    entity: "company",
    fields: ["id", "employees.customer.id", "orders.id"],
    filters: { id: companyId },
  });
  const customerIds = (company?.employees ?? [])
    .map((employee) => employee?.customer?.id)
    .filter((id): id is string => !!id);
  const linkedIds = ((company as { orders?: ({ id?: string } | null)[] })?.orders ?? [])
    .map((order) => order?.id)
    .filter((id): id is string => !!id);

  const [byCustomer, byLink] = await Promise.all([
    customerIds.length
      ? query.graph({
          entity: "order",
          fields: ORDER_FIELDS,
          filters: { customer_id: customerIds },
        })
      : { data: [] },
    linkedIds.length
      ? query.graph({
          entity: "order",
          fields: ORDER_FIELDS,
          filters: { id: linkedIds },
        })
      : { data: [] },
  ]);

  const orders = new Map<string, B2bOrder>();
  for (const order of [...byCustomer.data, ...byLink.data] as B2bOrder[]) {
    if (order?.id) {
      orders.set(order.id, order);
    }
  }
  return [...orders.values()];
}

/** P4-05: the approval settings of a company. */
export async function loadApprovalSettings(
  container: MedusaContainer,
  companyId: string
) {
  const {
    data: [settings],
  } = await queryOf(container).graph({
    entity: "approval_settings",
    fields: [
      "requires_admin_approval",
      "requires_sales_manager_approval",
      "approval_threshold",
    ],
    filters: { company_id: companyId },
  });
  return settings ?? null;
}

/** P4-05: the approvals of a cart. */
export async function loadCartApprovals(
  container: MedusaContainer,
  cartId: string
) {
  const { data } = await queryOf(container).graph({
    entity: "approval",
    fields: ["id", "type", "status"],
    filters: { cart_id: cartId },
  });
  return data;
}
