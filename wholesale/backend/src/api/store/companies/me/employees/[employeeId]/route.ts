import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  assertNotLastAdmin,
  requireCompanyMember,
  requireOwnEmployee,
} from "../../../../../../utils/b2b-access";
import {
  deleteEmployeesWorkflow,
  updateEmployeesWorkflow,
} from "../../../../../../workflows/employee/workflows";
import { storeEmployeeFields } from "../../../query-config";
import { StoreUpdateEmployeeType } from "../../../validators";

const retrieve = async (req: AuthenticatedMedusaRequest, id: string) => {
  const {
    data: [employee],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    { entity: "employee", fields: storeEmployeeFields, filters: { id } },
    { throwIfKeyNotFound: true }
  );
  return employee;
};

// P4-07: one employee of the buyer's own company (404 for anyone else's).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const member = await requireCompanyMember(req.scope, req.auth_context.actor_id);
  const own = await requireOwnEmployee(req.scope, member, req.params.employeeId);
  res.json({ employee: await retrieve(req, own.id) });
};

export const POST = async (
  req: AuthenticatedMedusaRequest<StoreUpdateEmployeeType>,
  res: MedusaResponse
) => {
  const member = await requireCompanyMember(
    req.scope,
    req.auth_context.actor_id,
    { admin: true }
  );
  const companyId = member.employee.company.id;
  const own = await requireOwnEmployee(req.scope, member, req.params.employeeId);
  const { spending_limit, is_admin } = req.validatedBody;
  if (is_admin === false) {
    await assertNotLastAdmin(req.scope, companyId, own.id);
  }

  await updateEmployeesWorkflow.run({
    input: { id: own.id, company_id: companyId, spending_limit, is_admin },
    container: req.scope,
  });

  res.json({ employee: await retrieve(req, own.id) });
};

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const member = await requireCompanyMember(
    req.scope,
    req.auth_context.actor_id,
    { admin: true }
  );
  const own = await requireOwnEmployee(req.scope, member, req.params.employeeId);
  await assertNotLastAdmin(req.scope, member.employee.company.id, own.id);

  await deleteEmployeesWorkflow.run({ input: [own.id], container: req.scope });

  res.json({ id: own.id, object: "employee", deleted: true });
};
