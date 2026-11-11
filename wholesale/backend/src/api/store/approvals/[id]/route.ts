import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { ApprovalStatusType, ApprovalType } from "../../../../types/approval";
import { loadBuyer } from "../../../../utils/load-b2b-buyer";
import { updateApprovalsWorkflow } from "../../../../workflows/approval/workflows";
import { StoreUpdateApprovalType } from "../validators";

export const POST = async (
  req: AuthenticatedMedusaRequest<StoreUpdateApprovalType>,
  res: MedusaResponse
) => {
  const customer_id = req.auth_context.actor_id;

  const { id: approvalId } = req.params;
  const { status } = req.validatedBody;

  // P4-05: the starter let any company admin decide any approval. Only an
  // admin of the cart's own company may, and only the company-admin
  // approval (the sales manager decides in the admin).
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [existing],
  } = await query.graph({
    entity: "approval",
    fields: ["id", "type", "cart_id", "status"],
    filters: { id: approvalId },
  });
  const {
    data: [cart],
  } = existing
    ? await query.graph({
        entity: "cart",
        fields: ["customer_id"],
        filters: { id: existing.cart_id },
      })
    : { data: [] };
  const [approver, cartBuyer] = await Promise.all([
    loadBuyer(req.scope, customer_id),
    loadBuyer(req.scope, cart?.customer_id),
  ]);
  const approverCompany = approver?.employee?.company?.id;
  // One answer for "not found" and "not yours", so other companies'
  // approval ids can't be told apart (REVIEW_FIXES B16).
  if (
    !existing ||
    (existing.type as string) !== ApprovalType.ADMIN ||
    !approver?.employee?.is_admin ||
    !approverCompany ||
    approverCompany !== cartBuyer?.employee?.company?.id
  ) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Approval not found");
  }
  if ((existing.status as string) !== ApprovalStatusType.PENDING) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This approval has already been decided."
    );
  }

  const { result: approval, errors } = await updateApprovalsWorkflow.run({
    input: {
      status,
      handled_by: customer_id,
      id: approvalId,
    },
    container: req.scope,
  });

  if (errors.length > 0) {
    res.status(400).json({
      message: errors[0].error.message,
      code: "INVALID_DATA",
    });
    return;
  }
  res.json({ approval });
};
