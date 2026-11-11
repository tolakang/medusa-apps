import {
  createFindParams,
  createOperatorMap,
} from "@medusajs/medusa/api/utils/validators";
import { z } from "@medusajs/framework/zod";
import { ApprovalType } from "../../../types/approval";

export type StoreGetApprovalsType = z.infer<typeof StoreGetApprovals>;
export const StoreGetApprovals = createFindParams()
  .merge(
    z.object({
      status: z
        .union([z.string(), z.array(z.string()), createOperatorMap()])
        .optional(),
      type: z
        .union([
          z.nativeEnum(ApprovalType),
          z.array(z.nativeEnum(ApprovalType)),
          createOperatorMap(),
        ])
        .optional(),
    })
  )
  .strict();

export type StoreUpdateApprovalType = z.infer<typeof StoreUpdateApproval>;
// REVIEW_FIXES B16: a decision, nothing else (the starter took any string,
// so "pending" could be set again, and any extra field).
export const StoreUpdateApproval = z
  .object({
    status: z.enum(["approved", "rejected"]),
  })
  .strict();
