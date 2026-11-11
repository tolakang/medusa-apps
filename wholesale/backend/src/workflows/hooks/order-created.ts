import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createOrderWorkflow } from "@medusajs/medusa/core-flows";
import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { COMPANY_MODULE } from "../../modules/company";
import { loadBuyer } from "../../utils/load-b2b-buyer";

createOrderWorkflow.hooks.orderCreated(
  async ({ order }, { container }) => {
    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);

    // P4-05: the order's company is the customer's company (employee
    // record), not `metadata.company_id`, which the client sets.
    const buyer = await loadBuyer(container, order.customer_id);
    const companyId = buyer?.employee?.company?.id;

    if (!companyId) {
      return new StepResponse(undefined, null);
    }

    await remoteLink.create({
      [Modules.ORDER]: {
        order_id: order.id,
      },
      [COMPANY_MODULE]: {
        company_id: companyId,
      },
    });

    return new StepResponse(undefined, { order_id: order.id, company_id: companyId });
  },
  // Both sides of the link: with only the order side `dismiss` throws
  // (REVIEW_FIXES B8).
  async (
    linked: { order_id: string; company_id: string } | null,
    { container }
  ) => {
    if (!linked) {
      return;
    }

    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);

    await remoteLink.dismiss({
      [Modules.ORDER]: {
        order_id: linked.order_id,
      },
      [COMPANY_MODULE]: {
        company_id: linked.company_id,
      },
    });
  }
);
