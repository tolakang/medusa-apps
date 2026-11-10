import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { transform } from "@medusajs/framework/workflows-sdk";
import { ModuleCreateCompany } from "../../../types";
import { createEmployeesWorkflow } from "../../employee/workflows/create-employees";
import { createCompaniesWorkflow } from "./create-companies";

/**
 * P4-07: a customer signs their company up. The company and its first
 * employee (the customer, as company admin) are created together, so there
 * is never a company without employees for someone else to claim (the
 * starter did it in two store calls, F-058).
 */
export const registerCompanyWorkflow = createWorkflow(
  "register-company",
  function (input: { company: ModuleCreateCompany; customer_id: string }) {
    const companies = createCompaniesWorkflow.runAsStep({
      input: transform(input, ({ company }) => [company]),
    });

    const employeeInput = transform({ companies, input }, ({ companies, input }) => ({
      employeeData: {
        company_id: companies[0].id,
        customer_id: input.customer_id,
        is_admin: true,
        spending_limit: 0,
      },
      customerId: input.customer_id,
    }));
    createEmployeesWorkflow.runAsStep({ input: employeeInput });

    return new WorkflowResponse(transform(companies, (companies) => companies[0]));
  }
);
