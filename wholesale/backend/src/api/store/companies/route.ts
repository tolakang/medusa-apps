import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { ModuleCompanyStatus, ModuleCreateCompany } from "../../../types";
import { signUpCompanyStatus } from "../../../utils/b2b-access";
import { loadBuyer } from "../../../utils/load-b2b-buyer";
import { registerCompanyWorkflow } from "../../../workflows/company/workflows";
import { storeCompanyFields } from "./query-config";
import { StoreCreateCompanyType } from "./validators";

// P4-07: company sign-up. The signed-in customer becomes the company's
// first employee and its admin in the same workflow; a customer who already
// belongs to a company can't create another. With
// WHOLESALE_REQUIRE_APPROVAL=true the company starts as "pending" and can't
// buy until the merchant approves it (P4-04).
export const POST = async (
  req: AuthenticatedMedusaRequest<StoreCreateCompanyType>,
  res: MedusaResponse
) => {
  const customerId = req.auth_context.actor_id;
  const buyer = await loadBuyer(req.scope, customerId);
  if (!buyer) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Create your customer account first."
    );
  }
  if (buyer.employee) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Your account already belongs to a company."
    );
  }

  const { result: created } = await registerCompanyWorkflow(req.scope).run({
    input: {
      company: {
        ...req.validatedBody,
        status: signUpCompanyStatus() as ModuleCompanyStatus,
      } as ModuleCreateCompany,
      customer_id: customerId,
    },
  });

  const {
    data: [company],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    {
      entity: "companies",
      fields: storeCompanyFields,
      filters: { id: created.id },
    },
    { throwIfKeyNotFound: true }
  );

  // `companies` keeps the starter's response shape; `company` is the same record.
  res.json({ company, companies: [company] });
};
