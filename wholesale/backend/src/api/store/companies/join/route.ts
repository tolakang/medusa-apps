import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { companyFromJoinCode } from "../../../../utils/company-invite";
import { loadBuyer } from "../../../../utils/load-b2b-buyer";
import { createEmployeesWorkflow } from "../../../../workflows/employee/workflows";
import { storeCompanyFields } from "../query-config";
import type { StoreJoinCompanyType } from "../validators";

export const WRONG_JOIN_CODE_MESSAGE =
  "This join code isn't for your email. Ask your company admin for a code for this email.";

// REVIEW_FIXES B14: a signed-in customer joins a company with the join code a
// company admin made for their email. They join as an employee without a
// spending limit and without admin rights; the company admin changes that.
export const POST = async (
  req: AuthenticatedMedusaRequest<StoreJoinCompanyType>,
  res: MedusaResponse
) => {
  const customerId = req.auth_context.actor_id;
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [customer],
  } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: { id: customerId },
  });
  if (!customer?.email) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Create your customer account first."
    );
  }
  const companyId = companyFromJoinCode(req.validatedBody.join_code, customer.email);
  if (!companyId) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, WRONG_JOIN_CODE_MESSAGE);
  }
  if ((await loadBuyer(req.scope, customerId))?.employee) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Your account already belongs to a company."
    );
  }
  const {
    data: [company],
  } = await query.graph({
    entity: "companies",
    fields: ["id", "status"],
    filters: { id: companyId },
  });
  if (!company || company.status === "suspended") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, WRONG_JOIN_CODE_MESSAGE);
  }

  await createEmployeesWorkflow.run({
    input: {
      employeeData: {
        customer_id: customerId,
        spending_limit: 0,
        is_admin: false,
        company_id: companyId,
      },
      customerId,
    },
    container: req.scope,
  });

  const {
    data: [joined],
  } = await query.graph({
    entity: "companies",
    fields: storeCompanyFields,
    filters: { id: companyId },
  });
  res.json({ company: joined });
};
