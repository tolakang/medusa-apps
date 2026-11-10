// P4-07 (F-058): the store company routes return fixed field lists for the
// buyer's own company. No `?fields`, so nothing else can be pulled through
// these routes.

/* The buyer's own company, with its terms (P4-02) */
export const storeCompanyFields = [
  "id",
  "name",
  "logo_url",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "zip",
  "country",
  "currency_code",
  "spending_limit_reset_frequency",
  "payment_terms",
  "credit_limit",
  "tax_id",
  "status",
  "employees.id",
  "employees.spending_limit",
  "employees.is_admin",
  "employees.company_id",
  "approval_settings.id",
  "approval_settings.requires_admin_approval",
  "approval_settings.requires_sales_manager_approval",
  "approval_settings.approval_threshold",
];

/* An employee of the buyer's own company */
export const storeEmployeeFields = [
  "id",
  "spending_limit",
  "is_admin",
  "company_id",
  "customer.id",
  "customer.email",
  "customer.first_name",
  "customer.last_name",
  "customer.phone",
];
