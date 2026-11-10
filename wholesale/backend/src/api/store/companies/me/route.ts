import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { requireCompanyMember } from "../../../../utils/b2b-access";
import { updateCompaniesWorkflow } from "../../../../workflows/company/workflows";
import { storeCompanyFields } from "../query-config";
import { StoreUpdateCompanyType } from "../validators";

const ownCompany = async (req: AuthenticatedMedusaRequest, id: string) => {
  const {
    data: [company],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    { entity: "companies", fields: storeCompanyFields, filters: { id } },
    { throwIfKeyNotFound: true }
  );
  return company;
};

// P4-07 (plan §6.4): the buyer's own company, from their employee record.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const member = await requireCompanyMember(req.scope, req.auth_context.actor_id);
  res.json({ company: await ownCompany(req, member.employee.company.id) });
};

// Company admins edit the buyer-editable fields (strict schema, P4-02).
export const POST = async (
  req: AuthenticatedMedusaRequest<StoreUpdateCompanyType>,
  res: MedusaResponse
) => {
  const member = await requireCompanyMember(
    req.scope,
    req.auth_context.actor_id,
    { admin: true }
  );
  const id = member.employee.company.id;

  await updateCompaniesWorkflow.run({
    input: { id, ...req.validatedBody },
    container: req.scope,
  });

  res.json({ company: await ownCompany(req, id) });
};
