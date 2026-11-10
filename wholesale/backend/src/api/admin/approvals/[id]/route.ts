import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { updateApprovalsWorkflow } from "../../../../workflows/approval/workflows";
import { AdminUpdateApproval } from "../../../../types/approval/http";

export const POST = async (
  req: AuthenticatedMedusaRequest<AdminUpdateApproval>,
  res: MedusaResponse
) => {
  // The signed-in admin user (MEDUSA_SKILL §7: `req.auth_context.actor_id`).
  // The starter read `app_metadata.user_id`, which not every admin token has.
  const user_id = req.auth_context.actor_id;

  const { id: approvalId } = req.params;
  const { status } = req.validatedBody;

  const { result: approval, errors } = await updateApprovalsWorkflow.run({
    input: {
      status,
      handled_by: user_id,
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
