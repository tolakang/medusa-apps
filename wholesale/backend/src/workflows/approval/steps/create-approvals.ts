import { MedusaError } from "@medusajs/framework/utils";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { APPROVAL_MODULE } from "../../../modules/approval";
import {
  assertApprovedCompanyBuyer,
  requiredApprovalTypes,
} from "../../../utils/b2b-cart-rules";
import {
  loadApprovalSettings,
  loadBuyer,
} from "../../../utils/load-b2b-buyer";
import {
  ApprovalStatusType,
  ApprovalType,
  IApprovalModuleService,
  ModuleCreateApproval,
} from "../../../types";

export const createApprovalStep = createStep(
  "create-approval",
  async (
    input:
      | Omit<ModuleCreateApproval, "type">
      | Omit<ModuleCreateApproval, "type">[],
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    const approvalData = Array.isArray(input) ? input : [input];

    const {
      data: [cart],
    } = await query.graph(
      {
        entity: "cart",
        fields: ["id", "customer_id", "total", "approvals.*", "approval_status.*"],
        filters: {
          id: approvalData[0].cart_id,
        },
      },
      {
        throwIfKeyNotFound: true,
      }
    );

    if (
      (cart.approval_status?.status as unknown as ApprovalStatusType) ===
      ApprovalStatusType.PENDING
    ) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cart already has a pending approval");
    }

    if (
      (cart.approval_status?.status as unknown as ApprovalStatusType) ===
      ApprovalStatusType.APPROVED
    ) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cart is already approved");
    }

    // P4-05: only the cart's own buyer asks, the company comes from their
    // employee record (the starter read the cart's company link, which came
    // from client-set metadata), and only the approval types the company's
    // threshold requires are created.
    const requester = approvalData[0].created_by;
    if (!cart.customer_id || cart.customer_id !== requester) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "You can only ask for approval of your own cart."
      );
    }
    const buyer = await loadBuyer(container, requester);
    const company = assertApprovedCompanyBuyer(buyer);
    const settings = await loadApprovalSettings(container, company.id);
    const types = requiredApprovalTypes(
      settings,
      Number(cart.total ?? 0),
      !!buyer?.employee?.is_admin
    );
    if (!types.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This cart doesn't need approval."
      );
    }

    const approvalsToCreate = types.flatMap((type) =>
      approvalData.map((data) => ({
        ...data,
        type: type === "admin" ? ApprovalType.ADMIN : ApprovalType.SALES_MANAGER,
      }))
    ) as ModuleCreateApproval[];

    if (approvalsToCreate.length === 0) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "No enabled approval types found");
    }

    const approvalModuleService =
      container.resolve<IApprovalModuleService>(APPROVAL_MODULE);

    const approvals = await approvalModuleService.createApprovals(
      approvalsToCreate
    );

    return new StepResponse(
      approvals,
      approvals.map((approval) => approval.id)
    );
  },
  async (approvalIds: string[], { container }) => {
    const approvalModuleService =
      container.resolve<IApprovalModuleService>(APPROVAL_MODULE);

    await approvalModuleService.deleteApprovals(approvalIds);
  }
);
