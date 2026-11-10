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

/** Orders placed by every employee of a company. */
export async function loadCompanyOrders(
  container: MedusaContainer,
  companyId: string
): Promise<B2bOrder[]> {
  const {
    data: [company],
  } = await queryOf(container).graph({
    entity: "company",
    fields: ["id", "employees.customer.id"],
    filters: { id: companyId },
  });
  const customerIds = (company?.employees ?? [])
    .map((employee) => employee?.customer?.id)
    .filter((id): id is string => !!id);
  if (!customerIds.length) {
    return [];
  }
  const { data } = await queryOf(container).graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { customer_id: customerIds },
  });
  return data as B2bOrder[];
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
