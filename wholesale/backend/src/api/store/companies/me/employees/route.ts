import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { requireCompanyMember } from "../../../../../utils/b2b-access";
import { loadBuyer } from "../../../../../utils/load-b2b-buyer";
import { createEmployeesWorkflow } from "../../../../../workflows/employee/workflows";
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

// A company admin adds a customer who isn't in a company yet.
export const POST = async (
  req: AuthenticatedMedusaRequest<StoreCreateEmployeeType>,
  res: MedusaResponse
) => {
  const member = await requireCompanyMember(
    req.scope,
    req.auth_context.actor_id,
    { admin: true }
  );
  const { customer_id, spending_limit, is_admin } = req.validatedBody;

  const customer = await loadBuyer(req.scope, customer_id);
  if (!customer) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Customer not found");
  }
  if (customer.employee) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This customer already belongs to a company."
    );
  }

  const { result: created } = await createEmployeesWorkflow.run({
    input: {
      employeeData: {
        customer_id,
        spending_limit: spending_limit ?? 0,
        is_admin: !!is_admin,
        company_id: member.employee.company.id,
      },
      customerId: customer_id,
    },
    container: req.scope,
  });

  const {
    data: [employee],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    {
      entity: "employee",
      fields: storeEmployeeFields,
      filters: { id: created.id },
    },
    { throwIfKeyNotFound: true }
  );

  res.json({ employee });
};
