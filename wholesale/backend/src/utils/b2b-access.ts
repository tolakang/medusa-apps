import { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { B2bBuyer, B2bCompany } from "./b2b-cart-rules";
import { loadBuyer } from "./load-b2b-buyer";

// P4-07 (F-058): who may use the store company, employee, approval and
// quote routes. The company and the admin flag always come from the
// signed-in customer's employee record, never from the URL or the body.

export type CompanyMember = B2bBuyer & {
  employee: NonNullable<B2bBuyer["employee"]> & { company: B2bCompany };
};

const forbidden = (message: string) =>
  new MedusaError(MedusaError.Types.FORBIDDEN, message);

/** The signed-in customer as a member of their company, or 403. */
export async function requireCompanyMember(
  container: MedusaContainer,
  customerId: string | null | undefined,
  options: { admin?: boolean } = {}
): Promise<CompanyMember> {
  const buyer = await loadBuyer(container, customerId);
  if (!buyer?.employee?.company) {
    throw forbidden("Your account is not part of a company.");
  }
  if (options.admin && !buyer.employee.is_admin) {
    throw forbidden("Only a company admin can do this.");
  }
  return buyer as CompanyMember;
}

/** An employee of the member's own company, or 404. */
export async function requireOwnEmployee(
  container: MedusaContainer,
  member: CompanyMember,
  employeeId: string
) {
  const {
    data: [employee],
  } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "employee",
    fields: ["id", "is_admin", "company_id"],
    filters: { id: employeeId, company_id: member.employee.company.id },
  });
  if (!employee) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Employee not found");
  }
  return employee;
}

/** A company must keep at least one admin. */
export async function assertNotLastAdmin(
  container: MedusaContainer,
  companyId: string,
  employeeId: string
) {
  const { data: admins } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "employee",
      fields: ["id"],
      filters: { company_id: companyId, is_admin: true },
    });
  if (admins.length === 1 && admins[0].id === employeeId) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "A company needs at least one admin."
    );
  }
}

/** The customer's own quote, or 404 (so ids of other quotes don't leak). */
export async function requireOwnQuote(
  container: MedusaContainer,
  quoteId: string,
  customerId: string | null | undefined
) {
  const {
    data: [quote],
  } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "quote",
    fields: ["id", "customer_id"],
    filters: { id: quoteId },
  });
  if (!quote || !customerId || quote.customer_id !== customerId) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Quote id not found: ${quoteId}`
    );
  }
  return quote;
}

/** New store sign-ups wait for the merchant when WHOLESALE_REQUIRE_APPROVAL=true. */
export const signUpCompanyStatus = () =>
  process.env.WHOLESALE_REQUIRE_APPROVAL === "true" ? "pending" : "approved";
