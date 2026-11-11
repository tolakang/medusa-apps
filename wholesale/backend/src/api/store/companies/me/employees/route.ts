import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { requireCompanyMember } from "../../../../../utils/b2b-access";
import { companyJoinCode } from "../../../../../utils/company-invite";
import { storeEmployeeFields } from "../../query-config";
import { StoreCreateEmployeeType } from "../../validators";

// P4-07 (plan §6.4): the employees of the buyer's own company.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const member = await requireCompanyMember(req.scope, req.auth_context.actor_id);

  const { data: employees } = await req.scope
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "employee",
      fields: storeEmployeeFields,
      filters: { company_id: member.employee.company.id },
    });

  res.json({ employees, count: employees.length });
};

// A company admin invites a colleague by email (REVIEW_FIXES B14): the
// answer is a join code for that email, which the admin gives the colleague.
// Nobody is added until the colleague, signed in with that email, joins with
// the code (POST /store/companies/join). Nothing about any customer is
// returned, so the route can't be used to look people up.
export const POST = async (
  req: AuthenticatedMedusaRequest<StoreCreateEmployeeType>,
  res: MedusaResponse
) => {
  const member = await requireCompanyMember(
    req.scope,
    req.auth_context.actor_id,
    { admin: true }
  );
  const email = req.validatedBody.email.trim().toLowerCase();
  res.json({
    invitation: {
      email,
      join_code: companyJoinCode(member.employee.company.id, email),
    },
  });
};
