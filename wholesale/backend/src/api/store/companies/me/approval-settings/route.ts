import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { requireCompanyMember } from "../../../../../utils/b2b-access";
import { updateApprovalSettingsWorkflow } from "../../../../../workflows/approval/workflows/update-approval-settings";
import { StoreUpdateApprovalSettingsType } from "../../validators";

// P4-07: a company admin switches the company-admin approval on or off for
// their own company. The sales-manager approval and the threshold stay with
// the merchant (P4-05).
export const POST = async (
  req: AuthenticatedMedusaRequest<StoreUpdateApprovalSettingsType>,
  res: MedusaResponse
) => {
  const member = await requireCompanyMember(
    req.scope,
    req.auth_context.actor_id,
    { admin: true }
  );

  const {
    data: [approval_settings],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "approval_settings",
    fields: ["id"],
    filters: { company_id: member.employee.company.id },
  });
  if (!approval_settings) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "This company has no approval settings."
    );
  }

  await updateApprovalSettingsWorkflow.run({
    input: {
      id: approval_settings.id,
      requires_admin_approval: req.validatedBody.requires_admin_approval,
    },
    container: req.scope,
  });

  res.status(201).send();
};
